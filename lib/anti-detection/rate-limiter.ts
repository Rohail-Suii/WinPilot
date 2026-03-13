/**
 * Anti-Detection Rate Limiter Service
 * Tracks daily usage and enforces limits to keep automation safe.
 */

import connectDB from "@/lib/db/connection";
import DailyUsage from "@/lib/db/models/daily-usage";
import { DAILY_LIMITS, SPEED_PRESETS, type SpeedPreset } from "./human-simulator";

type ActionType = keyof typeof DAILY_LIMITS;

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Check if an action can be performed without exceeding daily limits
 */
export async function canPerformAction(
  userId: string,
  actionType: ActionType,
  speed: SpeedPreset = "balanced"
): Promise<{ allowed: boolean; current: number; limit: number }> {
  await connectDB();
  const today = getTodayKey();

  const usage = await DailyUsage.findOne({ userId, date: today }).lean();
  const current = usage?.actions?.[actionType] ?? 0;
  const limit = Math.floor(DAILY_LIMITS[actionType] * SPEED_PRESETS[speed]);

  return { allowed: current < limit, current, limit };
}

/**
 * Increment usage counter for an action type
 */
export async function incrementUsage(
  userId: string,
  actionType: ActionType
): Promise<void> {
  await connectDB();
  const today = getTodayKey();

  await DailyUsage.findOneAndUpdate(
    { userId, date: today },
    { $inc: { [`actions.${actionType}`]: 1 } },
    { upsert: true }
  );
}

/**
 * Get all usage for today
 */
export async function getTodayUsage(
  userId: string
): Promise<Record<string, number>> {
  await connectDB();
  const today = getTodayKey();
  const usage = await DailyUsage.findOne({ userId, date: today }).lean();
  return usage?.actions ?? {
    applies: 0,
    posts: 0,
    scrapes: 0,
    profileViews: 0,
    messages: 0,
  };
}

/**
 * Get usage summary with limits for display
 */
export async function getUsageSummary(
  userId: string,
  speed: SpeedPreset = "balanced"
): Promise<{ actionType: string; current: number; limit: number; percentage: number }[]> {
  const usage = await getTodayUsage(userId);

  return (Object.keys(DAILY_LIMITS) as ActionType[]).map((actionType) => {
    const current = usage[actionType] ?? 0;
    const limit = Math.floor(DAILY_LIMITS[actionType] * SPEED_PRESETS[speed]);
    return {
      actionType,
      current,
      limit,
      percentage: limit > 0 ? Math.round((current / limit) * 100) : 0,
    };
  });
}

/**
 * Check if a user is approaching their daily limits (80%+)
 */
export async function isApproachingLimits(
  userId: string,
  speed: SpeedPreset = "balanced"
): Promise<{ approaching: boolean; warnings: string[] }> {
  const summary = await getUsageSummary(userId, speed);
  const warnings: string[] = [];

  for (const item of summary) {
    if (item.percentage >= 90) {
      warnings.push(`${item.actionType}: ${item.current}/${item.limit} (${item.percentage}%) — near limit!`);
    } else if (item.percentage >= 80) {
      warnings.push(`${item.actionType}: ${item.current}/${item.limit} (${item.percentage}%) — approaching limit`);
    }
  }

  return { approaching: warnings.length > 0, warnings };
}

// In-memory cooldown tracker for inter-action timing
const lastActionTimes = new Map<string, number>();

/**
 * Enforce minimum time between consecutive actions for a user.
 * Returns remaining wait time in ms, or 0 if action is allowed.
 */
export function checkCooldown(
  userId: string,
  actionType: ActionType,
  speed: SpeedPreset = "balanced"
): { allowed: boolean; waitMs: number } {
  const key = `${userId}:${actionType}`;
  const now = Date.now();
  const last = lastActionTimes.get(key) || 0;

  // Minimum seconds between actions based on speed
  const minGapSeconds: Record<SpeedPreset, number> = {
    conservative: 60,
    balanced: 30,
    aggressive: 15,
  };

  const minGapMs = minGapSeconds[speed] * 1000;
  const elapsed = now - last;

  if (elapsed < minGapMs) {
    return { allowed: false, waitMs: minGapMs - elapsed };
  }

  lastActionTimes.set(key, now);

  // Clean up old entries periodically (every 100 checks)
  if (lastActionTimes.size > 1000) {
    const cutoff = now - 3600000; // 1 hour
    for (const [k, v] of lastActionTimes) {
      if (v < cutoff) lastActionTimes.delete(k);
    }
  }

  return { allowed: true, waitMs: 0 };
}

const lastActionTimestamps = new Map<string, number>();

/**
 * Enforce minimum cooldown between consecutive actions to prevent rapid-fire API abuse.
 * Returns { allowed, waitMs } - if not allowed, waitMs indicates time to wait.
 */
export function checkActionCooldown(
  userId: string,
  actionType: string,
  minCooldownMs: number = 3000
): { allowed: boolean; waitMs: number } {
  const key = `${userId}:${actionType}`;
  const now = Date.now();
  const lastAction = lastActionTimestamps.get(key) || 0;
  const elapsed = now - lastAction;

  if (elapsed < minCooldownMs) {
    return { allowed: false, waitMs: minCooldownMs - elapsed };
  }

  lastActionTimestamps.set(key, now);

  // Cleanup old entries every 1000 insertions
  if (lastActionTimestamps.size > 10000) {
    const cutoff = now - 60000;
    for (const [k, v] of lastActionTimestamps) {
      if (v < cutoff) lastActionTimestamps.delete(k);
    }
  }

  return { allowed: true, waitMs: 0 };
}
