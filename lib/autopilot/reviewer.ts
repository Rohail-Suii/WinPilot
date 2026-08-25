/**
 * The weekly review — where the agent grades itself and changes.
 *
 * At the end of every 7-day cycle this computes what actually happened from
 * hard data (task outcomes, DailyUsage, pipeline movement, post engagement),
 * asks the AI to score the week honestly against its own targets, and distils
 * the result into AgentMemory entries that steer every subsequent week.
 *
 * Without this, the agent would repeat week 1 forever. This is the difference
 * between an autonomous agent and a scheduled script.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import AgentCycle, { type IAgentCycle, type ICycleActual } from "@/lib/db/models/agent-cycle";
import AgentGoal from "@/lib/db/models/agent-goal";
import AgentTask from "@/lib/db/models/agent-task";
import AgentTarget from "@/lib/db/models/agent-target";
import AgentThread from "@/lib/db/models/agent-thread";
import AgentMemory from "@/lib/db/models/agent-memory";
import Post from "@/lib/db/models/post";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import {
  buildCycleReviewPrompt,
  type CycleReviewResult,
} from "@/lib/ai/prompts/autopilot";
import { journal, journalDigest } from "./journal";
import { recall, remember, decay } from "./memory";

/** Metric names the reviewer knows how to compute from real data. */
const TASK_METRIC_KINDS: Record<string, string[]> = {
  comments_posted: ["comment_on_feed", "engage_target_post"],
  posts_liked: ["like_post", "warm_dormant_targets"],
  profiles_viewed: ["view_target_profile"],
  connections_sent: ["send_connection"],
  dms_sent: ["send_dm", "followup_target"],
  replies_sent: ["reply_thread"],
  posts_published: ["publish_post"],
  targets_discovered: ["discover_targets"],
};

/**
 * Compute what actually happened during a cycle.
 *
 * Everything here comes from stored records rather than counters the agent
 * incremented as it went, so a crashed run cannot inflate its own scorecard.
 */
export async function computeActuals(
  userId: string,
  cycle: IAgentCycle
): Promise<ICycleActual[]> {
  await connectDB();

  const window = { $gte: cycle.startsAt, $lte: cycle.endsAt };
  const uid = new mongoose.Types.ObjectId(userId);
  const actuals: ICycleActual[] = [];

  // Completed tasks, grouped by kind
  const byKind = await AgentTask.aggregate<{ _id: string; count: number }>([
    { $match: { userId: uid, state: "done", completedAt: window } },
    { $group: { _id: "$kind", count: { $sum: 1 } } },
  ]);
  const kindCounts = new Map(byKind.map((r) => [r._id, r.count]));

  for (const [metric, kinds] of Object.entries(TASK_METRIC_KINDS)) {
    const achieved = kinds.reduce((sum, k) => sum + (kindCounts.get(k) ?? 0), 0);
    actuals.push({ metric, achieved });
  }

  // Pipeline outcomes — the metrics that actually matter
  const [connectionsAccepted, conversationsStarted, opportunities, repliesReceived] =
    await Promise.all([
      AgentTarget.countDocuments({
        userId,
        stage: { $in: ["connected", "engaged", "dm_sent", "in_conversation", "opportunity"] },
        updatedAt: window,
      }),
      AgentTarget.countDocuments({ userId, stage: "in_conversation", updatedAt: window }),
      AgentTarget.countDocuments({ userId, stage: "opportunity", updatedAt: window }),
      AgentThread.countDocuments({ userId, lastMessageFrom: "them", lastMessageAt: window }),
    ]);

  actuals.push(
    { metric: "connections_accepted", achieved: connectionsAccepted },
    { metric: "dm_conversations_started", achieved: conversationsStarted },
    { metric: "opportunities_created", achieved: opportunities },
    { metric: "inbound_messages", achieved: repliesReceived }
  );

  // Content performance
  const posts = await Post.find({ userId, postedAt: window }).lean();
  const totalEngagement = posts.reduce(
    (sum, p) => sum + (p.engagement?.likes ?? 0) + (p.engagement?.comments ?? 0),
    0
  );
  actuals.push(
    { metric: "posts_published", achieved: posts.length },
    { metric: "post_engagement_total", achieved: totalEngagement }
  );

  // Reliability — a week of failures should visibly drag the score down
  const failed = await AgentTask.countDocuments({
    userId,
    state: "failed",
    completedAt: window,
  });
  actuals.push({ metric: "tasks_failed", achieved: failed });

  return actuals;
}

async function pipelineMovement(userId: string, cycle: IAgentCycle): Promise<string> {
  const uid = new mongoose.Types.ObjectId(userId);
  const moved = await AgentTarget.aggregate<{ _id: string; count: number }>([
    {
      $match: {
        userId: uid,
        updatedAt: { $gte: cycle.startsAt, $lte: cycle.endsAt },
      },
    },
    { $group: { _id: "$stage", count: { $sum: 1 } } },
  ]);

  if (moved.length === 0) return "(no pipeline movement this week)";
  return moved.map((m) => `${m._id}: ${m.count}`).join(", ");
}

function formatComparison(cycle: IAgentCycle, actuals: ICycleActual[]): string {
  const actualMap = new Map(actuals.map((a) => [a.metric, a.achieved]));

  const planned = cycle.targets.map((t) => {
    const got = actualMap.get(t.metric) ?? 0;
    const pct = t.planned > 0 ? Math.round((got / t.planned) * 100) : 0;
    return `${t.metric}: planned ${t.planned}, achieved ${got} (${pct}%)`;
  });

  // Include unplanned metrics too — the agent should notice outcomes it did not
  // set a target for, especially the ones that matter (conversations started).
  const unplanned = actuals
    .filter((a) => !cycle.targets.some((t) => t.metric === a.metric) && a.achieved > 0)
    .map((a) => `${a.metric}: ${a.achieved} (no target set)`);

  return [...planned, ...unplanned].join("\n") || "(no targets were set for this cycle)";
}

/**
 * Close a cycle: compute actuals, run the AI review, persist learnings.
 * Safe to call more than once — a cycle already closed is returned untouched.
 */
export async function closeCycle(
  userId: string,
  cycle: IAgentCycle
): Promise<IAgentCycle> {
  await connectDB();

  if (cycle.status === "closed") return cycle;

  cycle.status = "reviewing";
  await cycle.save();

  const actuals = await computeActuals(userId, cycle);
  cycle.actuals = actuals;

  const goal = await AgentGoal.findOne({ userId });
  const provider = await getUserAIProvider(userId);

  if (!provider || !goal) {
    // No AI available: still record the numbers so the week is not lost, and
    // say plainly why there is no analysis rather than inventing one.
    cycle.reviewSummary = provider
      ? "No goal on record, so I could not review this week against it."
      : "No AI provider configured, so I recorded the numbers but could not analyse them.";
    cycle.status = "closed";
    cycle.reviewedAt = new Date();
    await cycle.save();

    await journal({
      userId,
      cycleId: cycle._id,
      entryType: "reflection",
      phase: "review",
      text: `Week ${cycle.weekNumber} closed without analysis. ${cycle.reviewSummary}\n${formatComparison(cycle, actuals)}`,
    });
    return cycle;
  }

  const [digest, movement, existing] = await Promise.all([
    journalDigest(userId, 40, cycle._id.toString()),
    pipelineMovement(userId, cycle),
    recall(userId, { limit: 15 }),
  ]);

  let review: CycleReviewResult | null = null;
  try {
    review = await provider.generateJSON<CycleReviewResult>(
      buildCycleReviewPrompt({
        weekNumber: cycle.weekNumber,
        northStar: goal.northStar,
        strategy: cycle.strategy,
        targetsVsActuals: formatComparison(cycle, actuals),
        pipelineMovement: movement,
        journalDigest: digest,
        existingMemories:
          existing.map((m) => `- ${m.statement}`).join("\n") || "(none yet)",
      }),
      { temperature: 0.3, maxTokens: 1800 }
    );
  } catch (error) {
    await journal({
      userId,
      cycleId: cycle._id,
      entryType: "error",
      phase: "review",
      text: `The review AI call failed: ${(error as Error).message}. I recorded the week's numbers but produced no analysis.`,
    });
  }

  if (review) {
    cycle.score = clampScore(review.score);
    cycle.reviewSummary = review.reviewSummary || "";
    cycle.strategyDelta = review.strategyDelta || "";

    // Persist new learnings
    for (const learning of (review.learnings || []).slice(0, 7)) {
      if (!learning?.statement) continue;
      await remember({
        userId,
        kind: learning.kind || "insight",
        statement: learning.statement,
        confidence: clampConfidence(learning.confidence),
        sourceCycleId: cycle._id.toString(),
        evidence: [{ type: "cycle", refId: cycle._id.toString() }],
      });
    }

    // Decay anything this week disproved
    for (const statement of (review.contradicted || []).slice(0, 10)) {
      const match = existing.find(
        (m) => m.statement.trim().toLowerCase() === statement.trim().toLowerCase()
      );
      if (match) await decay(match._id.toString());
    }
  }

  cycle.status = "closed";
  cycle.reviewedAt = new Date();
  await cycle.save();

  await journal({
    userId,
    cycleId: cycle._id,
    entryType: "reflection",
    phase: "review",
    text: `Week ${cycle.weekNumber} review — score ${cycle.score ?? "n/a"}/100.\n\n${cycle.reviewSummary || "(no summary)"}\n\nWhat changes next week: ${cycle.strategyDelta || "(no change recorded)"}\n\nNumbers:\n${formatComparison(cycle, actuals)}`,
  });

  return cycle;
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Force a review of the running cycle without waiting for day 7.
 * Used by the "force_review" API action and by the tests.
 */
export async function forceReview(userId: string): Promise<IAgentCycle | null> {
  await connectDB();
  const running = await AgentCycle.findOne({ userId, status: "running" });
  if (!running) return null;
  return closeCycle(userId, running);
}

/** Memory count for a cycle, used by tests and the dashboard. */
export async function memoriesFromCycle(cycleId: string): Promise<number> {
  await connectDB();
  return AgentMemory.countDocuments({ sourceCycleId: cycleId });
}
