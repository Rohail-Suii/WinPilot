/**
 * Autopilot control surface.
 *
 * GET    — everything the dashboard renders: config, goal, current cycle,
 *          queue, recent journal, memory, pipeline funnel
 * PATCH  — update config (mode, mission, feed settings, hours, budgets, autonomy)
 * POST   — start | stop | replan | force_review
 */

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import AgentConfig, { TASK_KINDS } from "@/lib/db/models/agent-config";
import AgentGoal from "@/lib/db/models/agent-goal";
import AgentCycle from "@/lib/db/models/agent-cycle";
import AgentTask from "@/lib/db/models/agent-task";
import AgentTarget from "@/lib/db/models/agent-target";
import { isExtensionConnected } from "@/lib/websocket/server";
import { recall } from "@/lib/autopilot/memory";
import { recentJournal, journal } from "@/lib/autopilot/journal";
import { forceReview } from "@/lib/autopilot/reviewer";
import { tick, planCycle, ensureGoal } from "@/lib/autopilot/planner";
import { getSchedulerStatus } from "@/lib/autopilot/scheduler";
import * as governor from "@/lib/autopilot/governor";

const configSchema = z.object({
  mode: z.enum(["feed", "strategist"]).optional(),
  mission: z.string().max(500).optional(),
  feed: z
    .object({
      commentRatio: z.number().min(0).max(1),
      pitchOnJobPosts: z.boolean(),
      postsPerSweep: z.number().min(5).max(60),
      postsPerPass: z.number().min(1).max(25),
      unlimited: z.boolean(),
      economyMode: z.boolean(),
      dailyAiCalls: z.number().min(0).max(5000),
      dailyAiSpendUsd: z.number().min(0).max(1000),
    })
    .partial()
    .optional(),
  workingHours: z
    .object({
      start: z.number().min(0).max(23),
      end: z.number().min(1).max(24),
      timezone: z.string().max(64),
      activeDays: z.array(z.number().min(0).max(6)).max(7),
    })
    .partial()
    .optional(),
  weeklyBudgets: z
    .object({
      connects: z.number().min(0).max(200),
      comments: z.number().min(0).max(300),
      dms: z.number().min(0).max(200),
      posts: z.number().min(0).max(21),
      likes: z.number().min(0).max(500),
      profileViews: z.number().min(0).max(700),
    })
    .partial()
    .optional(),
  autonomy: z.record(z.enum(TASK_KINDS), z.enum(["auto", "review"])).optional(),
});

const actionSchema = z.object({
  action: z.enum(["start", "stop", "replan", "force_review", "resume"]),
});

/** Guests have no User document and cannot run the extension. */
async function requireUser() {
  const actor = await getActorId();
  if (!actor || actor.isGuest) return null;
  return actor.id;
}

async function getOrCreateConfig(userId: string) {
  await connectDB();
  const existing = await AgentConfig.findOne({ userId });
  if (existing) return existing;
  return AgentConfig.create({ userId });
}

export async function GET() {
  try {
    const userId = await requireUser();
    if (!userId) {
      return NextResponse.json(
        { error: "Autopilot requires a signed-in account" },
        { status: 401 }
      );
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const config = await getOrCreateConfig(userId);

    const [goal, cycle, queue, journalEntries, memories, funnel] = await Promise.all([
      AgentGoal.findOne({ userId }).lean(),
      AgentCycle.findOne({ userId, status: "running" }).lean(),
      AgentTask.find({ userId, state: { $in: ["queued", "dispatched", "running"] } })
        .sort({ priority: -1, scheduledFor: 1 })
        .limit(25)
        .lean(),
      recentJournal(userId, 60),
      recall(userId, { limit: 25, minConfidence: 0 }),
      AgentTarget.aggregate<{ _id: string; count: number }>([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$stage", count: { $sum: 1 } } },
      ]),
    ]);

    const now = new Date();
    const paused = Boolean(config.pausedUntil && config.pausedUntil > now);

    return NextResponse.json({
      config: {
        enabled: config.enabled,
        mode: config.mode,
        mission: config.mission,
        feed: config.feed,
        workingHours: config.workingHours,
        weeklyBudgets: config.weeklyBudgets,
        autonomy: Object.fromEntries(config.autonomy ?? new Map()),
        pausedUntil: config.pausedUntil,
        pauseReason: config.pauseReason,
        lastTickAt: config.lastTickAt,
        rampFactor: governor.rampFactor(config, now),
      },
      status: {
        paused,
        withinWorkingHours: governor.isWithinUserHours(config, now),
        nextWindowStart: governor.nextWindowStart(config, now),
        extensionConnected: isExtensionConnected(userId),
        scheduler: getSchedulerStatus(),
      },
      goal,
      cycle,
      queue,
      journal: journalEntries,
      memories,
      funnel: Object.fromEntries(funnel.map((f) => [f._id, f.count])),
    });
  } catch (error) {
    console.error("[Autopilot] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = configSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const config = await getOrCreateConfig(userId);
    const { mode, mission, feed, workingHours, weeklyBudgets, autonomy } = parsed.data;
    const missionChanged = mission !== undefined && mission !== config.mission;
    const modeChanged = mode !== undefined && mode !== config.mode;

    if (mode !== undefined) config.mode = mode;
    if (feed) Object.assign(config.feed, feed);
    if (mission !== undefined) config.mission = mission;
    if (workingHours) {
      Object.assign(config.workingHours, workingHours);
      if (config.workingHours.end <= config.workingHours.start) {
        return NextResponse.json(
          { error: "Working hours end must be after start" },
          { status: 400 }
        );
      }
    }
    if (weeklyBudgets) Object.assign(config.weeklyBudgets, weeklyBudgets);
    if (autonomy) {
      for (const [kind, autonomyMode] of Object.entries(autonomy)) {
        config.autonomy.set(kind, autonomyMode);
      }
    }

    await config.save();

    // Queued work belongs to the mode that planned it — a strategist keyword
    // task left in the queue would send the agent off searching the moment
    // feed mode started, against a goal the user just stopped using.
    let cancelled = 0;
    if (modeChanged) {
      const { modifiedCount } = await AgentTask.updateMany(
        { userId, state: { $in: ["queued", "dispatched", "running"] } },
        { $set: { state: "skipped", error: "Cancelled when the mode changed" } }
      );
      cancelled = modifiedCount;

      await journal({
        userId,
        entryType: "decision",
        phase: "planning",
        text:
          mode === "feed"
            ? `Switched to feed mode. I will read down your feed, like what is worth liking, and comment where I have something real to add. No mission or weekly plan needed. Dropped ${cancelled} task${cancelled === 1 ? "" : "s"} the old mode had queued.`
            : `Switched to strategist mode. I will work from your mission, decompose it into a goal and plan the week around it. Dropped ${cancelled} feed task${cancelled === 1 ? "" : "s"}.`,
      });
    }

    if (missionChanged) {
      await journal({
        userId,
        entryType: "observation",
        phase: "planning",
        text: `The mission changed to "${mission}". My existing goal is now out of date — replan to rebuild it.`,
      });
    }

    return NextResponse.json({ ok: true, missionChanged, modeChanged, cancelled });
  } catch (error) {
    console.error("[Autopilot] PATCH failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const config = await getOrCreateConfig(userId);

    switch (parsed.data.action) {
      case "start": {
        // Feed mode has nothing to decompose, so it needs no mission — that
        // requirement is the whole reason it exists.
        if (config.mode !== "feed" && !config.mission?.trim()) {
          return NextResponse.json(
            { error: "Set a mission before starting autopilot in strategist mode" },
            { status: 400 }
          );
        }
        config.enabled = true;
        config.pausedUntil = undefined;
        config.pauseReason = "";
        if (!config.rampStartedAt) config.rampStartedAt = new Date();
        await config.save();

        const hours = `Working ${config.workingHours.start}:00-${config.workingHours.end}:00 ${config.workingHours.timezone}, ramping in at ${Math.round(governor.rampFactor(config) * 100)}% of budget.`;

        await journal({
          userId,
          entryType: "decision",
          phase: "general",
          text:
            config.mode === "feed"
              ? `Autopilot started in feed mode. I will read down your feed, like posts worth liking, and comment where I have something real to say${config.feed?.pitchOnJobPosts === false ? "" : ", pitching properly on anything that turns out to be a hiring post"}. ${hours}`
              : `Autopilot started. Mission: "${config.mission}". ${hours}`,
        });

        // Don't make the user wait up to a full interval for the first move.
        const result = await tick(userId);
        return NextResponse.json({ ok: true, firstTick: result });
      }

      case "stop": {
        config.enabled = false;
        await config.save();

        // Anything queued is abandoned rather than left to fire on restart.
        const { modifiedCount } = await AgentTask.updateMany(
          { userId, state: { $in: ["queued", "dispatched", "running"] } },
          { $set: { state: "skipped", error: "Autopilot stopped by the user" } }
        );

        await journal({
          userId,
          entryType: "decision",
          phase: "general",
          text: `Autopilot stopped by the user. Cancelled ${modifiedCount} pending task${modifiedCount === 1 ? "" : "s"}.`,
        });

        return NextResponse.json({ ok: true, cancelled: modifiedCount });
      }

      case "resume": {
        config.pausedUntil = undefined;
        config.pauseReason = "";
        await config.save();
        await journal({
          userId,
          entryType: "decision",
          phase: "safety",
          text: "The user cleared the pause. Resuming — I will re-check account health as I go.",
        });
        return NextResponse.json({ ok: true });
      }

      case "replan": {
        const goal = await ensureGoal(userId, config);
        if (!goal) {
          return NextResponse.json(
            { error: "Cannot plan without a mission and an AI provider" },
            { status: 400 }
          );
        }

        const running = await AgentCycle.findOne({ userId, status: "running" });
        if (running) await forceReview(userId);

        const cycle = await planCycle(userId, config, goal, running);
        return NextResponse.json({ ok: true, cycle });
      }

      case "force_review": {
        const cycle = await forceReview(userId);
        if (!cycle) {
          return NextResponse.json({ error: "No running cycle" }, { status: 400 });
        }
        return NextResponse.json({ ok: true, cycle });
      }
    }
  } catch (error) {
    console.error("[Autopilot] POST failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
