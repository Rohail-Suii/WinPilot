/**
 * Activity Patterns
 * Defines natural activity mixing patterns to avoid detection.
 * Randomizes order, inserts browsing breaks, and varies timing.
 */

import { randomDelay, cooldownDelay } from "./human-simulator";

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Randomly skip items from a list (simulates human selectivity)
 * @param items List of items
 * @param skipRate Percentage of items to skip (0-1, default 0.15 = 15%)
 */
export function applyRandomSkipping<T>(items: T[], skipRate: number = 0.15): T[] {
  return items.filter(() => Math.random() > skipRate);
}

/**
 * Generate a browsing activity to insert between automated actions
 */
export type BrowsingAction = 
  | { type: "scroll_feed"; duration: number }
  | { type: "view_profile"; duration: number }
  | { type: "read_article"; duration: number }
  | { type: "like_post"; duration: number }
  | { type: "view_notifications"; duration: number };

export function generateBrowsingAction(): BrowsingAction {
  const actions: BrowsingAction[] = [
    { type: "scroll_feed", duration: 15000 + Math.random() * 45000 },     // 15-60s
    { type: "view_profile", duration: 10000 + Math.random() * 30000 },    // 10-40s
    { type: "read_article", duration: 30000 + Math.random() * 120000 },   // 30s-2.5min
    { type: "like_post", duration: 2000 + Math.random() * 5000 },         // 2-7s
    { type: "view_notifications", duration: 5000 + Math.random() * 15000 }, // 5-20s
  ];

  return actions[Math.floor(Math.random() * actions.length)];
}

/**
 * Determine if a browsing break should be inserted between actions
 * Returns true approximately once every 3-5 actions
 */
export function shouldInsertBrowsingBreak(actionIndex: number): boolean {
  const interval = 3 + Math.floor(Math.random() * 3); // Every 3-5 actions
  return actionIndex > 0 && actionIndex % interval === 0;
}

/**
 * Simulate time spent viewing a job posting before applying
 */
export async function simulateJobReading(): Promise<void> {
  // Spend 30s - 2min "reading" the job description
  const readTime = 30000 + Math.random() * 90000;
  await randomDelay(readTime * 0.9, readTime * 1.1);
}

/**
 * Simulate time spent reviewing a profile before outreach
 */
export async function simulateProfileReview(): Promise<void> {
  // Spend 10s - 40s "reviewing" a profile
  const reviewTime = 10000 + Math.random() * 30000;
  await randomDelay(reviewTime * 0.9, reviewTime * 1.1);
}

/**
 * Apply inter-action delay based on action type
 */
export async function applyActionDelay(
  actionType: "applies" | "posts" | "comments" | "messages" | "connectionRequests" | "profileViews"
): Promise<void> {
  await cooldownDelay(actionType);
}

/**
 * Plan a job application sequence with natural patterns:
 * - Shuffled order
 * - Random skipping
 * - Browsing breaks inserted
 * - Variable reading time per job
 */
export function planJobApplicationSequence<T extends { matchScore?: number }>(
  jobs: T[]
): { job: T; browsingBreak: boolean; skipReason?: string }[] {
  // Sort by match score but add some randomness
  const sorted = [...jobs].sort((a, b) => {
    const scoreA = (a.matchScore ?? 50) + (Math.random() * 20 - 10);
    const scoreB = (b.matchScore ?? 50) + (Math.random() * 20 - 10);
    return scoreB - scoreA;
  });

  return sorted.map((job, index) => ({
    job,
    browsingBreak: shouldInsertBrowsingBreak(index),
    skipReason: Math.random() < 0.1 ? "random_skip" : undefined, // ~10% skip rate
  }));
}

/**
 * Calculate safety score (0-100) based on current activity patterns.
 * Higher = safer (more human-like).
 */
export function calculateSafetyScore(
  actionsToday: Record<string, number>,
  limits: Record<string, number>,
  sessionDurationMs: number
): number {
  let score = 100;

  // Penalize for being close to limits
  for (const key of Object.keys(actionsToday)) {
    const used = actionsToday[key] ?? 0;
    const limit = limits[key] ?? 100;
    const usage = used / limit;

    if (usage > 0.9) score -= 30;
    else if (usage > 0.7) score -= 15;
    else if (usage > 0.5) score -= 5;
  }

  // Penalize for very long sessions
  const sessionHours = sessionDurationMs / (60 * 60 * 1000);
  if (sessionHours > 3) score -= 25;
  else if (sessionHours > 2) score -= 10;

  return Math.max(0, Math.min(100, score));
}
