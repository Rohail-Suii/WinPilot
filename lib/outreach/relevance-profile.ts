/**
 * The user's own history, in the shape the relevance gate scores against.
 *
 * Split from the scoring itself so that scoring stays pure — the rules are the
 * interesting part and they should be readable, and testable, without a
 * database behind them.
 */

import connectDB from "@/lib/db/connection";
import AgentGoal from "@/lib/db/models/agent-goal";
import CareerProfile from "@/lib/db/models/career-profile";
import type { RelevanceProfile } from "./relevance";

/**
 * The profile changes about as often as a person changes jobs, and this is read
 * once per hiring post found. Five minutes of cache turns a burst of openings
 * on one feed sweep into a single pair of queries.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { profile: RelevanceProfile; at: number }>();

export async function loadRelevanceProfile(userId: string): Promise<RelevanceProfile> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.profile;

  await connectDB();
  const [goal, career] = await Promise.all([
    AgentGoal.findOne({ userId }).select("personaSnapshot").lean(),
    CareerProfile.findOne({ userId }).select("skills experience projects").lean(),
  ]);

  const snapshot = goal?.personaSnapshot;

  const skills = [
    ...(snapshot?.topSkills ?? []),
    ...(career?.skills ?? []),
    ...(career?.projects ?? []).flatMap((p) => p.tech ?? []),
  ];

  const titles = [
    snapshot?.headline || "",
    ...(career?.experience ?? []).map((e) => e.title || ""),
    // The persona's project names carry titles too ("Frontend Engineer @ Foxtel").
    ...(snapshot?.signatureProjects ?? []).map((p) => p.name || ""),
  ];

  const profile: RelevanceProfile = {
    skills: [...new Set(skills.map((s) => s.trim()).filter(Boolean))],
    titles: [...new Set(titles.map((t) => t.trim()).filter(Boolean))],
  };

  cache.set(userId, { profile, at: Date.now() });
  return profile;
}

/** Drop a cached profile — called when the career profile is edited. */
export function forgetRelevanceProfile(userId: string): void {
  cache.delete(userId);
}
