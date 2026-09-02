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
  };
}
