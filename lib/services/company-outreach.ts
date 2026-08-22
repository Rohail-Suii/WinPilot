/**
 * Company Outreach Service
 * Writes the short follow-up message sent on LinkedIn right after an
 * application is submitted, when Auto Messaging is on.
 *
 * Falls back to a plain template when the user has no AI key configured, so
 * outreach still works with AI switched off.
 */

import { getUserAIProvider } from "@/lib/ai/key-manager";
import {
  buildCompanyOutreachPrompt,
  type OutreachChannel,
} from "@/lib/ai/prompts/company-outreach";
import { getDefaultResume, resumeToText } from "./resume-service";
import { getCareerProfile, careerProfileHasContent } from "./career-profile";
import { sanitizeForAI } from "@/lib/utils";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";

/**
 * A company page's message modal hard-caps its textarea at 750 characters, so
 * stay under that — and a wall of text gets ignored anyway.
 */
export const MAX_MESSAGE_LENGTH = 700;

export interface OutreachMessageInput {
  channel: OutreachChannel;
  jobTitle: string;
  company: string;
  recipientName?: string;
  recipientHeadline?: string;
  jobDescription?: string;
}

export interface OutreachMessageResult {
  message: string;
  source: "ai" | "template";
  personalizationPoint?: string;
}

function firstName(fullName?: string): string {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}

/** Plain, honest fallback used when no AI provider is configured or the call fails. */
function templateMessage(input: OutreachMessageInput, senderName?: string): string {
  const greeting = input.recipientName ? `Hi ${firstName(input.recipientName)},` : "Hello,";
  const ask =
    input.channel === "connection"
      ? "If you know who owns this role, I'd appreciate a pointer in the right direction."
      : "If it looks like a fit, I'd welcome the chance to talk it through.";

  return [
    greeting,
    `I just applied for the ${input.jobTitle} role at ${input.company} and wanted to flag my application directly.`,
    ask,
    senderName ? `Thanks,\n${senderName}` : "Thanks for your time.",
  ].join("\n\n");
}

/** Condensed background used to ground the message in real experience. */
async function getSenderBackground(userId: string): Promise<string> {
  const career = await getCareerProfile(userId);
  if (careerProfileHasContent(career)) {
    return resumeToText({
      summary: career!.summary || "",
      experience: (career!.experience || []).map((e) => ({
        company: e.company,
        title: e.title,
        description: e.description || "",
        highlights: e.highlights || [],
      })),
      education: (career!.education || []).map((e) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
      })),
      skills: career!.skills || [],
      certifications: (career!.certifications || []).map((c) => ({
        name: c.name,
        issuer: c.issuer,
      })),
      projects: (career!.projects || []).map((p) => ({
        name: p.name,
        description: p.description || "",
        tech: p.tech || [],
      })),
    });
  }

  const resume = await getDefaultResume(userId);
  if (!resume) return "";

  return resumeToText({
    summary: resume.summary || "",
    experience: (resume.experience || []).map((e) => ({
      company: e.company,
      title: e.title,
      description: e.description || "",
      highlights: e.highlights || [],
    })),
    education: (resume.education || []).map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
    })),
    skills: resume.skills || [],
    certifications: (resume.certifications || []).map((c) => ({
      name: c.name,
      issuer: c.issuer,
    })),
    projects: (resume.projects || []).map((p) => ({
      name: p.name,
      description: p.description || "",
      tech: p.tech || [],
    })),
  });
}

function tidy(message: string): string {
  const cleaned = (message || "")
    .replace(/^\s*subject\s*:.*$/gim, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > MAX_MESSAGE_LENGTH
    ? `${cleaned.slice(0, MAX_MESSAGE_LENGTH - 1).trimEnd()}…`
    : cleaned;
}

/**
 * Compose the outreach message for one application.
 * Never throws — a failed AI call falls back to the template so the run keeps going.
 */
export async function generateOutreachMessage(
  userId: string,
  input: OutreachMessageInput
): Promise<OutreachMessageResult> {
  await connectDB();
  const user = (await User.findById(userId, { name: 1 }).lean()) as { name?: string } | null;
  const senderName = user?.name || "";

  const ai = await getUserAIProvider(userId);
  if (!ai) {
    return { message: tidy(templateMessage(input, senderName)), source: "template" };
  }

  try {
    const background = await getSenderBackground(userId);
    const messages = buildCompanyOutreachPrompt({
      channel: input.channel,
      jobTitle: input.jobTitle,
      company: input.company,
      recipientName: input.recipientName,
      recipientHeadline: input.recipientHeadline,
      senderName,
      senderBackground: sanitizeForAI(background),
      jobDescription: sanitizeForAI(input.jobDescription || ""),
    });

    const result = await ai.generateJSON<{ message?: string; personalizationPoint?: string }>(
      messages,
      { maxTokens: 600 }
    );

    const message = tidy(typeof result?.message === "string" ? result.message : "");
    if (!message) {
      return { message: tidy(templateMessage(input, senderName)), source: "template" };
    }

    return {
      message,
      source: "ai",
      personalizationPoint:
        typeof result?.personalizationPoint === "string" ? result.personalizationPoint : undefined,
    };
  } catch {
    return { message: tidy(templateMessage(input, senderName)), source: "template" };
  }
}
