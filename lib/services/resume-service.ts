/**
 * Resume Service
 * Handles resume upload, AI-powered parsing, and CRUD operations.
 */

import connectDB from "@/lib/db/connection";
import Resume, { type IResume } from "@/lib/db/models/resume";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { buildResumeParsingPrompt } from "@/lib/ai/prompts";

interface ParsedResume {
  contactInfo: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
  };
  summary: string;
  experience: {
    company: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    current: boolean;
    description: string;
    highlights: string[];
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
  }[];
  skills: string[];
  certifications: { name: string; issuer: string; date?: string | null }[];
  projects: { name: string; description: string; url?: string | null; tech: string[] }[];
}

/**
 * Parse raw resume text using AI
 */
export async function parseResumeWithAI(
  userId: string,
  rawText: string
): Promise<ParsedResume> {
  const ai = await getUserAIProvider(userId);
  if (!ai) {
    throw new Error("No AI API key configured. Add one in Settings → AI Keys.");
  }

  const messages = buildResumeParsingPrompt(rawText);
  const parsed = await ai.generateJSON<ParsedResume>(messages, { maxTokens: 4096 });
  return parsed;
}

/**
 * Create or update a resume from parsed data
 */
export async function saveResume(
  userId: string,
  name: string,
  parsedData: ParsedResume,
  rawText: string,
  isDefault: boolean = false
): Promise<IResume> {
  await connectDB();

  // If setting as default, unset other defaults
  if (isDefault) {
    await Resume.updateMany({ userId }, { isDefault: false });
  }

  // Check if this is the first resume (make it default)
  const existingCount = await Resume.countDocuments({ userId });
  if (existingCount === 0) {
    isDefault = true;
  }

  const resume = await Resume.create({
    userId,
    name,
    isDefault,
    contactInfo: {
      name: parsedData.contactInfo.name ?? undefined,
      phone: parsedData.contactInfo.phone ?? undefined,
      email: parsedData.contactInfo.email ?? undefined,
      location: parsedData.contactInfo.location ?? undefined,
      linkedin: parsedData.contactInfo.linkedin ?? undefined,
      github: parsedData.contactInfo.github ?? undefined,
      portfolio: parsedData.contactInfo.portfolio ?? undefined,
    },
    summary: parsedData.summary || "",
    experience: parsedData.experience.map((exp) => ({
      company: exp.company,
      title: exp.title,
      startDate: exp.startDate || "",
      endDate: exp.endDate ?? undefined,
      current: exp.current || false,
      description: exp.description || "",
      highlights: exp.highlights || [],
    })),
    education: parsedData.education.map((edu) => ({
      school: edu.school,
      degree: edu.degree || "",
      field: edu.field || "",
      startDate: edu.startDate ?? undefined,
      endDate: edu.endDate ?? undefined,
      gpa: edu.gpa ?? undefined,
    })),
    skills: parsedData.skills || [],
    certifications: (parsedData.certifications || []).map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date ?? undefined,
    })),
    projects: (parsedData.projects || []).map((p) => ({
      name: p.name,
      description: p.description,
      url: p.url ?? undefined,
      tech: p.tech || [],
    })),
    rawText,
  });

  return resume;
}

/**
 * Get all resumes for a user
 */
export async function getUserResumes(userId: string) {
  await connectDB();
  return Resume.find({ userId }).sort({ isDefault: -1, createdAt: -1 }).lean();
}

/**
 * Get the default resume for a user
 */
export async function getDefaultResume(userId: string) {
  await connectDB();
  let resume = await Resume.findOne({ userId, isDefault: true }).lean();
  if (!resume) {
    resume = await Resume.findOne({ userId }).sort({ createdAt: -1 }).lean();
  }
  return resume;
}

/**
 * Update a resume
 */
export async function updateResume(
  userId: string,
  resumeId: string,
  updates: Partial<Pick<IResume, "name" | "contactInfo" | "summary" | "experience" | "education" | "skills" | "certifications" | "projects" | "isDefault">>
) {
  await connectDB();

  if (updates.isDefault) {
    await Resume.updateMany({ userId }, { isDefault: false });
  }

  return Resume.findOneAndUpdate(
    { _id: resumeId, userId },
    { $set: updates },
    { returnDocument: "after" }
  ).lean();
}

/**
 * Delete a resume
 */
export async function deleteResume(userId: string, resumeId: string) {
  await connectDB();
  return Resume.findOneAndDelete({ _id: resumeId, userId });
}

/**
 * Get resume as plain text for AI context
 */
export function resumeToText(resume: {
  summary?: string;
  experience?: { company: string; title: string; description: string; highlights: string[] }[];
  education?: { school: string; degree: string; field: string }[];
  skills?: string[];
  certifications?: { name: string; issuer: string }[];
  projects?: { name: string; description: string; tech: string[] }[];
}): string {
  const parts: string[] = [];

  if (resume.summary) {
    parts.push(`SUMMARY:\n${resume.summary}`);
  }

  if (resume.experience?.length) {
    parts.push(
      `EXPERIENCE:\n${resume.experience
        .map(
          (e) =>
            `${e.title} at ${e.company}\n${e.description}\n${e.highlights.map((h) => `• ${h}`).join("\n")}`
        )
        .join("\n\n")}`
    );
  }

  if (resume.education?.length) {
    parts.push(
      `EDUCATION:\n${resume.education.map((e) => `${e.degree} in ${e.field} — ${e.school}`).join("\n")}`
    );
  }

  if (resume.skills?.length) {
    parts.push(`SKILLS: ${resume.skills.join(", ")}`);
  }

  if (resume.certifications?.length) {
    parts.push(
      `CERTIFICATIONS:\n${resume.certifications.map((c) => `${c.name} — ${c.issuer}`).join("\n")}`
    );
  }

  if (resume.projects?.length) {
    parts.push(
      `PROJECTS:\n${resume.projects.map((p) => `${p.name}: ${p.description} [${p.tech.join(", ")}]`).join("\n")}`
    );
  }

  return parts.join("\n\n");
}
