/**
 * Resume Tailor Service
 * Uses AI to tailor a resume for a specific job description.
 * Source modes:
 *  - resume: optimize uploaded/default resume document
 *  - data: rebuild from full structured career data (experience/projects/etc.)
 */

import { getUserAIProvider } from "@/lib/ai/key-manager";
import {
  buildResumeTailoringPrompt,
  type ResumeTailoringSource,
} from "@/lib/ai/prompts/resume-tailoring";
import { getDefaultResume, resumeToText } from "./resume-service";
import { sanitizeForAI } from "@/lib/utils";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";

export interface TailoredExperienceItem {
  company: string;
  title: string;
  description: string;
  highlights: string[];
}

export interface TailoredProjectItem {
  name: string;
  description: string;
  tech: string[];
}

export interface TailoredResumeResult {
  tailoredSummary: string;
  tailoredSkills: string[];
  tailoredHighlights: string[];
  tailoredExperience: TailoredExperienceItem[];
  tailoredProjects: TailoredProjectItem[];
  detectedRole: string;
  matchScore: number;
  matchExplanation: string;
  keywordsUsed: string[];
  source: ResumeTailoringSource;
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

function normalizeExperience(raw: unknown): TailoredExperienceItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const exp = item as Record<string, unknown>;
      const company = typeof exp.company === "string" ? cleanResumeText(exp.company) : "";
      const title = typeof exp.title === "string" ? cleanResumeText(exp.title) : "";
      if (!company && !title) return null;
      return {
        company,
        title,
        description:
          typeof exp.description === "string" ? cleanResumeText(exp.description) : "",
        highlights: toStringArray(exp.highlights),
      };
    })
    .filter((x): x is TailoredExperienceItem => !!x);
}

function normalizeProjects(raw: unknown): TailoredProjectItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const name = typeof p.name === "string" ? cleanResumeText(p.name) : "";
      if (!name) return null;
      return {
        name,
        description:
          typeof p.description === "string" ? cleanResumeText(p.description) : "",
        tech: toStringArray(p.tech),
      };
    })
    .filter((x): x is TailoredProjectItem => !!x);
}

function normalizeTailoredResumeResult(
  raw: unknown,
  source: ResumeTailoringSource
): TailoredResumeResult {
  const sourceObj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const matchScoreRaw = sourceObj.matchScore;
  const numericScore =
    typeof matchScoreRaw === "number" ? matchScoreRaw : Number(matchScoreRaw);
  const normalizedScore = Number.isFinite(numericScore)
    ? Math.max(0, Math.min(100, Math.round(numericScore)))
    : 0;

  return {
    tailoredSummary:
      typeof sourceObj.tailoredSummary === "string"
        ? cleanResumeText(sourceObj.tailoredSummary)
        : "",
    tailoredSkills: toStringArray(sourceObj.tailoredSkills),
    tailoredHighlights: toStringArray(sourceObj.tailoredHighlights),
    tailoredExperience: normalizeExperience(sourceObj.tailoredExperience),
    tailoredProjects: normalizeProjects(sourceObj.tailoredProjects),
    detectedRole:
      typeof sourceObj.detectedRole === "string"
        ? cleanResumeText(sourceObj.detectedRole)
        : "",
    matchScore: normalizedScore,
    matchExplanation:
      typeof sourceObj.matchExplanation === "string"
        ? cleanResumeText(sourceObj.matchExplanation)
        : "",
    keywordsUsed: toStringArray(sourceObj.keywordsUsed),
    source,
  };
}

export async function getResumeTailoringSource(
  userId: string
): Promise<ResumeTailoringSource> {
  try {
    await connectDB();
    const user = await User.findById(userId).select("settings").lean();
    const source = (user as { settings?: { resumeTailoringSource?: string } } | null)
      ?.settings?.resumeTailoringSource;
    return source === "data" ? "data" : "resume";
  } catch {
    return "resume";
  }
}

/**
 * Tailor a resume for a specific job description
 */
export async function tailorResumeForJob(
  userId: string,
  jobDescription: string,
  _resumeId?: string
): Promise<TailoredResumeResult> {
  const ai = await getUserAIProvider(userId);
  if (!ai) {
    throw new Error("No AI API key configured");
  }

  const resume = await getDefaultResume(userId);
  const source = await getResumeTailoringSource(userId);
  const sanitizedDescription = sanitizeForAI(jobDescription);

  // Data mode: dedicated Career Profile first. Resume upload is optional in this mode.
  let baseData: Parameters<typeof buildResumeTailoringPrompt>[0];
  let customPrompt: string | undefined;

  if (source === "data") {
    const { getCareerProfile, careerProfileHasContent } = await import(
      "./career-profile"
    );
    const career = await getCareerProfile(userId);

    if (careerProfileHasContent(career)) {
      baseData = {
        summary: career!.summary || "",
        experience: (career!.experience || []).map((e) => ({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate || undefined,
          current: e.current,
          description: e.description,
          highlights: e.highlights || [],
        })),
        skills: career!.skills || [],
        education: (career!.education || []).map((edu) => ({
          school: edu.school,
          degree: edu.degree,
          field: edu.field,
        })),
        certifications: (career!.certifications || []).map((c) => ({
          name: c.name,
          issuer: c.issuer,
          date: c.date || undefined,
        })),
        projects: (career!.projects || []).map((p) => ({
          name: p.name,
          description: p.description,
          tech: p.tech || [],
          url: p.url || undefined,
        })),
      };
    } else if (resume) {
      // Fallback: structured fields from default resume if career bank empty
      baseData = {
        summary: resume.summary || "",
        experience: (resume.experience || []).map((e) => ({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate || undefined,
          current: e.current,
          description: e.description,
          highlights: e.highlights || [],
        })),
        skills: resume.skills || [],
        education: (resume.education || []).map((edu) => ({
          school: edu.school,
          degree: edu.degree,
          field: edu.field,
        })),
        certifications: (resume.certifications || []).map((c) => ({
          name: c.name,
          issuer: c.issuer,
          date: c.date || undefined,
        })),
        projects: (resume.projects || []).map((p) => ({
          name: p.name,
          description: p.description,
          tech: p.tech || [],
          url: p.url || undefined,
        })),
        rawText: resume.rawText || undefined,
      };
    } else {
      throw new Error(
        "No career data found. Go to Jobs → Settings → Resume → Career Data, add experience/projects/skills, then Save Career Data."
      );
    }

    customPrompt = (resume as unknown as { customTailoringPrompt?: string } | null)
      ?.customTailoringPrompt;
  } else {
    if (!resume) {
      throw new Error("No resume found. Upload a resume in Settings first.");
    }

    baseData = {
      summary: resume.summary || "",
      experience: (resume.experience || []).map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate || undefined,
        current: e.current,
        description: e.description,
        highlights: e.highlights || [],
      })),
      skills: resume.skills || [],
      education: (resume.education || []).map((edu) => ({
        school: edu.school,
        degree: edu.degree,
        field: edu.field,
      })),
      certifications: (resume.certifications || []).map((c) => ({
        name: c.name,
        issuer: c.issuer,
        date: c.date || undefined,
      })),
      projects: (resume.projects || []).map((p) => ({
        name: p.name,
        description: p.description,
        tech: p.tech || [],
        url: p.url || undefined,
      })),
      rawText: resume.rawText || resumeToText(resume),
    };
    customPrompt = (resume as unknown as { customTailoringPrompt?: string })
      .customTailoringPrompt;
  }

  if (
    source === "data" &&
    !baseData.experience.length &&
    !baseData.projects?.length &&
    !baseData.skills.length &&
    !baseData.summary
  ) {
    throw new Error(
      "Career data is empty. Add experience, projects, or skills under Jobs → Settings → Resume → Career Data."
    );
  }

  const messages = buildResumeTailoringPrompt(
    baseData,
    sanitizedDescription,
    customPrompt,
    source
  );
  const result = await ai.generateJSON<unknown>(messages);

  return normalizeTailoredResumeResult(result, source);
}

/**
 * Get match score for a job without full tailoring
 */
export async function getJobMatchScore(
  userId: string,
  jobDescription: string
): Promise<{
  score: number;
  summary: string;
  skillsMatch?: number;
  experienceMatch?: number;
  educationMatch?: number;
  matchingSkills?: string[];
  missingSkills?: string[];
  strengths?: string[];
  concerns?: string[];
  recommendation?: string;
}> {
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
    skillsMatch?: number;
    experienceMatch?: number;
    educationMatch?: number;
    matchingSkills?: string[];
    missingSkills?: string[];
    strengths?: string[];
    concerns?: string[];
    recommendation?: string;
  }>(messages);

  return {
    score: result.overallScore,
    summary: result.summary,
    skillsMatch: result.skillsMatch,
    experienceMatch: result.experienceMatch,
    educationMatch: result.educationMatch,
    matchingSkills: result.matchingSkills,
    missingSkills: result.missingSkills,
    strengths: result.strengths,
    concerns: result.concerns,
    recommendation: result.recommendation,
  };
}
