/**
 * The persona snapshot: the user's real background, frozen into the one shape
 * every generation prompt reads.
 *
 * This lives on its own rather than inside the planner because feed mode needs
 * it at generation time with no goal in sight, and pulling the planner into an
 * API route would drag the whole scheduler/websocket surface along with it.
 */

import connectDB from "@/lib/db/connection";
import type { IPersonaSnapshot } from "@/lib/db/models/agent-goal";
import CareerProfile from "@/lib/db/models/career-profile";
import ProfileAnalysis from "@/lib/db/models/profile-analysis";
import User from "@/lib/db/models/user";

/**
 * The user's portfolio link, read straight from the career profile.
 *
 * A persona snapshot frozen onto an AgentGoal before this field existed does
 * not carry it, and rebuilding the whole snapshot to recover one string is
 * wasteful — so pitches fall back to this.
 */
export async function resolvePortfolioUrl(userId: string): Promise<string> {
  await connectDB();
  const career = await CareerProfile.findOne({ userId })
    .select("contactInfo.portfolio")
    .lean();
  return normaliseLink(career?.contactInfo?.portfolio);
}

/**
 * A profile link that is safe to paste into a comment.
 *
 * Profiles get filled in by hand, so the value can arrive as "rohail.systems",
 * with stray whitespace, or as something that is not a URL at all. Anything
 * that does not parse as http(s) is dropped rather than posted.
 */
function normaliseLink(raw: string | undefined): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/**
 * Freeze the user's real background into the shape every prompt reads.
 *
 * This is the anti-slop mechanism: generation prompts are only ever allowed to
 * reference what is in here, so the agent writes about actual projects instead
 * of inventing a career.
 */
export async function buildPersonaSnapshot(userId: string): Promise<IPersonaSnapshot> {
  await connectDB();

  const [career, analysis, user] = await Promise.all([
    CareerProfile.findOne({ userId }).lean(),
    ProfileAnalysis.findOne({ userId }).lean(),
    User.findById(userId).lean(),
  ]);

  const experience = career?.experience ?? [];
  const projects = career?.projects ?? [];

  // Years of experience from the earliest dated role we can parse.
  let yearsExperience = 0;
  const startYears = experience
    .map((e) => parseInt((e.startDate || "").slice(0, 4), 10))
    .filter((y) => Number.isFinite(y) && y > 1970);
  if (startYears.length > 0) {
    yearsExperience = Math.max(0, new Date().getFullYear() - Math.min(...startYears));
  }

  const signatureProjects = [
    ...projects.map((p) => ({
      name: p.name || "",
      whatIDid: p.description || "",
      tech: p.tech || [],
    })),
    ...experience.map((e) => ({
      name: `${e.title} @ ${e.company}`,
      whatIDid: e.highlights?.length ? e.highlights.join("; ") : e.description || "",
      tech: [] as string[],
    })),
  ]
    .filter((p) => p.name && p.whatIDid)
    .slice(0, 8);

  return {
    headline:
      analysis?.sections?.headline?.current ||
      user?.linkedinProfile?.headline ||
      experience[0]?.title ||
      "",
    summary: career?.summary || analysis?.sections?.summary?.current || "",
    topSkills: (career?.skills ?? []).slice(0, 15),
    signatureProjects,
    voiceNotes: "",
    yearsExperience,
    location: career?.contactInfo?.location || "",
    portfolioUrl: normaliseLink(career?.contactInfo?.portfolio),
  };
}
