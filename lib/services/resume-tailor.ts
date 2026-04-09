/**
 * Resume Tailor Service
 * Uses AI to tailor a resume for a specific job description.
 */

import { getUserAIProvider } from "@/lib/ai/key-manager";
import { buildResumeTailoringPrompt } from "@/lib/ai/prompts";
import { getDefaultResume, resumeToText } from "./resume-service";
import { sanitizeForAI } from "@/lib/utils";

export interface TailoredResumeResult {
  tailoredSummary: string;
  tailoredSkills: string[];
  tailoredHighlights: string[];
  matchScore: number;
  matchExplanation: string;
  keywordsUsed: string[];
}

function cleanResumeText(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === "string") return [item];
        if (item && typeof item === "object") {
          const maybeHighlights = (item as { highlights?: unknown }).highlights;
          if (Array.isArray(maybeHighlights)) {
            return maybeHighlights.filter((h): h is string => typeof h === "string");
          }
        }
        return [];
      })
      .map((s) => cleanResumeText(s))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return toStringArray(parsed);
    } catch {
      return [cleanResumeText(trimmed)].filter(Boolean);
    }
  }

  return [];
}

function normalizeTailoredResumeResult(raw: unknown): TailoredResumeResult {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const matchScoreRaw = source.matchScore;
  const numericScore = typeof matchScoreRaw === "number" ? matchScoreRaw : Number(matchScoreRaw);
  const normalizedScore = Number.isFinite(numericScore)
    ? Math.max(0, Math.min(100, Math.round(numericScore)))
    : 0;

  return {
    tailoredSummary:
      typeof source.tailoredSummary === "string" ? cleanResumeText(source.tailoredSummary) : "",
    tailoredSkills: toStringArray(source.tailoredSkills),
    tailoredHighlights: toStringArray(source.tailoredHighlights),
    matchScore: normalizedScore,
    matchExplanation:
      typeof source.matchExplanation === "string" ? cleanResumeText(source.matchExplanation) : "",
    keywordsUsed: toStringArray(source.keywordsUsed),
  };
}

/**
 * Tailor a resume for a specific job description
 */
export async function tailorResumeForJob(
  userId: string,
  jobDescription: string,
  resumeId?: string
): Promise<TailoredResumeResult> {
  const ai = await getUserAIProvider(userId);
  if (!ai) {
    throw new Error("No AI API key configured");
  }

  const resume = await getDefaultResume(userId);
  if (!resume) {
    throw new Error("No resume found. Upload a resume in Settings first.");
  }

  const sanitizedDescription = sanitizeForAI(jobDescription);

  const resumeData = {
    summary: resume.summary || "",
    experience: resume.experience.map((e) => ({
      company: e.company,
      title: e.title,
      description: e.description,
      highlights: e.highlights,
    })),
    skills: resume.skills,
    education: resume.education.map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
    })),
  };

  const messages = buildResumeTailoringPrompt(resumeData, sanitizedDescription);
  const result = await ai.generateJSON<unknown>(messages);

  return normalizeTailoredResumeResult(result);
}

/**
 * Get match score for a job without full tailoring
 */
export async function getJobMatchScore(
  userId: string,
  jobDescription: string
): Promise<{ score: number; summary: string }> {
  const ai = await getUserAIProvider(userId);
  if (!ai) {
    return { score: 0, summary: "No AI key configured" };
  }

  const resume = await getDefaultResume(userId);
  if (!resume) {
    return { score: 0, summary: "No resume uploaded" };
  }

  const resumeText = resume.rawText || resumeToText(resume);
  const sanitizedDescription = sanitizeForAI(jobDescription);

  const { buildJobMatchScoringPrompt } = await import("@/lib/ai/prompts");
  const messages = buildJobMatchScoringPrompt(resumeText, sanitizedDescription);
  const result = await ai.generateJSON<{
    overallScore: number;
    summary: string;
  }>(messages);

  return { score: result.overallScore, summary: result.summary };
}
