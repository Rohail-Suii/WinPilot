/**
 * What autopilot is allowed to spend on AI, and on which model.
 *
 * Feed mode makes a model call per post it comments on, all day, with no
 * ceiling of its own — the LinkedIn budgets govern actions, not tokens. On a
 * metered key that is the difference between a working agent and an exhausted
 * balance by lunchtime, so the spend is capped here and checked before every
 * generation.
 *
 * The primary cap counts CALLS rather than dollars. Only some providers report
 * token usage, so a dollar cap would silently never trip on the others, and a
 * cap that only works sometimes is worse than no cap at all. Calls are exact
 * everywhere, and with a bounded prompt they track cost closely enough. The
 * dollar cap is layered on top for providers that do report.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import AIUsageLog from "@/lib/db/models/ai-usage-log";

/**
 * The cheapest model per provider that can still write a two-sentence comment.
 *
 * A feed comment is a short, tightly specified writing task with the entire
 * voice spec in the prompt. Frontier models earn their price on goal
 * decomposition and cycle review, where the reasoning is the product; paying
 * frontier rates per feed post is the largest avoidable cost in a pass.
 */
const ECONOMY_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  groq: "llama-3.1-8b-instant",
  // Gemini runs one model, and OpenRouter already runs whatever the user
  // picked — its default is a free model, so overriding would cost them more.
};

/** The model to write feed comments with, or undefined to leave it alone. */
export function economyModel(provider: string | undefined): string | undefined {
  return provider ? ECONOMY_MODELS[provider] : undefined;
}

export interface BudgetVerdict {
  allowed: boolean;
  calls: number;
  maxCalls: number;
  costUsd: number;
  maxCostUsd: number;
  /** Why it was refused, ready to put in front of the user. */
  reason?: string;
}

/** Midnight today, in the user's own timezone. */
function startOfDayIn(timezone: string, now = new Date()): Date {
  try {
    const stamp = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    return new Date(`${stamp}T00:00:00Z`);
  } catch {
    const midnight = new Date(now);
    midnight.setUTCHours(0, 0, 0, 0);
    return midnight;
  }
}

/**
 * Autopilot's own AI usage today: how many calls, and what they cost where the
 * provider says.
 *
 * Scoped to autopilot endpoints. A resume rewrite the user asked for by hand
 * must not eat the agent's allowance, or the other way round.
 */
export async function usageToday(
  userId: string,
  timezone = "UTC"
): Promise<{ calls: number; costUsd: number }> {
  await connectDB();

  let owner: mongoose.Types.ObjectId | string = userId;
  try {
    owner = new mongoose.Types.ObjectId(userId);
  } catch {
    // Not an ObjectId — match on whatever was given rather than throwing.
  }

  const [row] = await AIUsageLog.aggregate<{ calls: number; costUsd: number }>([
    {
      $match: {
        userId: owner,
        endpoint: { $regex: "^/api/autopilot" },
        createdAt: { $gte: startOfDayIn(timezone) },
      },
    },
    { $group: { _id: null, calls: { $sum: 1 }, costUsd: { $sum: "$costUsd" } } },
  ]);

  return { calls: row?.calls ?? 0, costUsd: row?.costUsd ?? 0 };
}

/**
 * Is there room in today's allowance for another generation?
 *
 * A cap of 0 means uncapped — the right setting for a free model, or a plan
 * that is not billed per token.
 */
export async function checkBudget(
  userId: string,
  caps: { maxCalls?: number; maxCostUsd?: number },
  timezone = "UTC"
): Promise<BudgetVerdict> {
  const maxCalls = caps.maxCalls ?? 0;
  const maxCostUsd = caps.maxCostUsd ?? 0;

  if (maxCalls <= 0 && maxCostUsd <= 0) {
    return { allowed: true, calls: 0, maxCalls: 0, costUsd: 0, maxCostUsd: 0 };
  }

  const { calls, costUsd } = await usageToday(userId, timezone);
  const base = { calls, maxCalls, costUsd, maxCostUsd };

  if (maxCalls > 0 && calls >= maxCalls) {
    return {
      ...base,
      allowed: false,
      reason: `Today's AI allowance is spent (${calls} of ${maxCalls} calls). I will keep liking posts and start commenting again tomorrow.`,
    };
  }

  if (maxCostUsd > 0 && costUsd >= maxCostUsd) {
    return {
      ...base,
      allowed: false,
      reason: `Today's AI spend limit is reached ($${costUsd.toFixed(2)} of $${maxCostUsd.toFixed(2)}). I will keep liking posts and start commenting again tomorrow.`,
    };
  }

  return { ...base, allowed: true };
}
