/**
 * The planner — the part of the agent that decides what to do.
 *
 * Called once every scheduler tick per enabled user. Its whole job is to move
 * the user from "has a mission" to "has a task in flight", re-deriving state
 * from Mongo every time so that a server restart is a non-event.
 *
 * There are two brains behind the same queue, selected by `config.mode`:
 *
 *   tick()  "feed" mode — the default, and the one that works with zero setup
 *     ├─ topUpFeedQueue()  thin queue? → queue like/comment passes over the feed
 *     ├─ pickNextTask()
 *     ├─ governor.check()
 *     └─ dispatch()        → sendToExtension
 *
 *   tick()  "strategist" mode — the full planning stack
 *     ├─ ensureGoal()    no goal?  → AI decomposes the mission
 *     ├─ ensureCycle()   no cycle? → review the last one, plan the next 7 days
 *     ├─ topUpQueue()    thin queue? → generate the next batch of tasks
 *     ├─ pickNextTask()  highest priority, due, not blocked
 *     ├─ governor.check()
 *     └─ dispatch()      → sendToExtension
 *
 * Both paths share selection, the governor, dispatch and the result handler, so
 * a mode switch changes only which tasks land in the queue.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import AgentConfig, {
  IMPLEMENTED_TASK_KINDS,
  DEFAULT_FEED_SETTINGS,
  type IAgentConfig,
  type TaskKind,
} from "@/lib/db/models/agent-config";
import AgentGoal, { type IAgentGoal } from "@/lib/db/models/agent-goal";
import AgentCycle, {
  DEFAULT_CHANNEL_MIX,
  type IAgentCycle,
} from "@/lib/db/models/agent-cycle";
import AgentTask, { type IAgentTask } from "@/lib/db/models/agent-task";
import AgentJournal from "@/lib/db/models/agent-journal";
import AgentTarget from "@/lib/db/models/agent-target";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import {
  buildGoalDecompositionPrompt,
  buildCyclePlanPrompt,
  type GoalDecompositionResult,
  type CyclePlanResult,
} from "@/lib/ai/prompts/autopilot";
import { sanitizeForAI } from "@/lib/utils";
import { sendToExtension } from "@/lib/websocket/server";
import { pushSseEvent } from "@/lib/sse";
import { journal, journalDigest } from "./journal";
import { recallBlock } from "./memory";
import { buildPersonaSnapshot } from "./persona";
import { closeCycle } from "./reviewer";
import * as governor from "./governor";

/** How many tasks the planner keeps queued ahead of the executor. */
const QUEUE_TARGET = 12;

/** A task stuck in `dispatched` this long is presumed lost and is requeued. */
const DISPATCH_TIMEOUT_MS = 15 * 60 * 1000;

const CYCLE_LENGTH_MS = 7 * 24 * 60 * 60 * 1000;

// ── Persona ─────────────────────────────────────────────────────────────────

/**
 * Re-exported so existing callers keep importing it from the planner. The
 * implementation moved to ./persona once feed mode needed it without a goal.
 */
export { buildPersonaSnapshot } from "./persona";

// ── Goal ────────────────────────────────────────────────────────────────────

export async function ensureGoal(
  userId: string,
  config: IAgentConfig
): Promise<IAgentGoal | null> {
  await connectDB();

  const existing = await AgentGoal.findOne({ userId });
  if (existing) return existing;

  if (!config.mission?.trim()) {
    await journal({
      userId,
      entryType: "observation",
      phase: "planning",
      text: "I have no mission set, so there is nothing to plan towards. Set one on the Mission tab and I will decompose it into a goal.",
    });
    return null;
  }

  const persona = await buildPersonaSnapshot(userId);
  const provider = await getUserAIProvider(userId);

  if (!provider) {
    await journal({
      userId,
      entryType: "error",
      phase: "planning",
      text: "No AI provider is configured, so I cannot decompose the mission into a goal. Add an API key in Settings.",
    });
    return null;
  }

  let decomposed: GoalDecompositionResult;
  try {
    decomposed = await provider.generateJSON<GoalDecompositionResult>(
      buildGoalDecompositionPrompt(sanitizeForAI(config.mission), persona),
      { temperature: 0.4, maxTokens: 1600 }
    );
  } catch (error) {
    await journal({
      userId,
      entryType: "error",
      phase: "planning",
      text: `I could not decompose the mission: ${(error as Error).message}. I will try again on the next tick.`,
    });
    return null;
  }

  const goal = await AgentGoal.create({
    userId,
    northStar: decomposed.northStar || config.mission,
    successMetric: {
      kind: decomposed.successMetric?.kind || "dm_conversations_started",
      target: decomposed.successMetric?.target || 10,
      by: new Date(
        Date.now() + (decomposed.successMetric?.days || 90) * 24 * 60 * 60 * 1000
      ),
    },
    subGoals: (decomposed.subGoals || []).map((s) => ({ ...s, status: "open" as const })),
    constraints: {
      niche: decomposed.constraints?.niche || [],
      targetRoles: decomposed.constraints?.targetRoles || [],
      targetCompanySizeMin: decomposed.constraints?.targetCompanySizeMin ?? 5,
      targetCompanySizeMax: decomposed.constraints?.targetCompanySizeMax ?? 100,
      geographies: decomposed.constraints?.geographies || [],
      excludes: decomposed.constraints?.excludes || [],
    },
    personaSnapshot: { ...persona, voiceNotes: decomposed.voiceNotes || "" },
  });

  await journal({
    userId,
    entryType: "decision",
    phase: "planning",
    text: `I turned the mission "${config.mission}" into a goal: ${goal.northStar}. Success means ${goal.successMetric.target} ${goal.successMetric.kind} by ${goal.successMetric.by?.toDateString()}. I will target ${goal.constraints.targetRoles.join(", ") || "relevant decision-makers"} at companies of ${goal.constraints.targetCompanySizeMin}-${goal.constraints.targetCompanySizeMax} people${goal.constraints.geographies.length ? ` in ${goal.constraints.geographies.join(", ")}` : ""}.`,
  });

  // Start the ramp clock the moment the agent has something to aim at.
  if (!config.rampStartedAt) {
    config.rampStartedAt = new Date();
    await config.save();
  }

  return goal;
}

// ── Cycle ───────────────────────────────────────────────────────────────────

export async function ensureCycle(
  userId: string,
  config: IAgentConfig,
  goal: IAgentGoal
): Promise<IAgentCycle | null> {
  await connectDB();

  const running = await AgentCycle.findOne({ userId, status: "running" });
  if (running && running.endsAt > new Date()) return running;

  if (running) {
    // The week is up. Grade it before planning the next one — the review is
    // what makes the next cycle different from this one.
    await closeCycle(userId, running);
  }

  return planCycle(userId, config, goal, running);
}

export async function planCycle(
  userId: string,
  config: IAgentConfig,
  goal: IAgentGoal,
  previous?: IAgentCycle | null
): Promise<IAgentCycle | null> {
  await connectDB();

  const weekNumber = (previous?.weekNumber ?? 0) + 1;
  const now = new Date();

  const [memories, digest, pipeline] = await Promise.all([
    recallBlock(userId, { limit: 12 }),
    journalDigest(userId, 20),
    pipelineSummary(userId),
  ]);

  const provider = await getUserAIProvider(userId);
  let plan: CyclePlanResult | null = null;

  if (provider) {
    try {
      plan = await provider.generateJSON<CyclePlanResult>(
        buildCyclePlanPrompt({
          weekNumber,
          northStar: goal.northStar,
          successMetric: `${goal.successMetric.target} ${goal.successMetric.kind} by ${goal.successMetric.by?.toDateString() ?? "unset"}`,
          constraints: JSON.stringify(goal.constraints),
          memories,
          journalDigest: digest,
          pipelineSummary: pipeline,
          lastCycle: previous
            ? `Week ${previous.weekNumber}: ${previous.strategy}\nTargets: ${JSON.stringify(previous.targets)}\nActuals: ${JSON.stringify(previous.actuals)}\nReview: ${previous.reviewSummary || "(none)"}`
            : "(this is the first week)",
          budgets: describeBudgets(config),
          capabilities: describeCapabilities(),
        }),
        { temperature: 0.5, maxTokens: 1400 }
      );
    } catch (error) {
      await journal({
        userId,
        entryType: "error",
        phase: "planning",
        text: `Cycle planning AI call failed: ${(error as Error).message}. Falling back to a conservative default plan for week ${weekNumber}.`,
      });
    }
  }

  const channelMix = normaliseMix(plan?.channelMix);

  const cycle = await AgentCycle.create({
    userId,
    weekNumber,
    startsAt: now,
    endsAt: new Date(now.getTime() + CYCLE_LENGTH_MS),
    strategy:
      plan?.strategy ||
      `Week ${weekNumber}: no AI plan available, so I am running a conservative default — steady engagement on niche content while I build up data to plan from.`,
    channelMix,
    targets: (plan?.targets || defaultTargets(config)).map((t) => ({
      metric: t.metric,
      planned: Math.max(0, Math.round(t.planned)),
    })),
    actuals: [],
    status: "running",
  });

  await journal({
    userId,
    cycleId: cycle._id,
    entryType: "decision",
    phase: "planning",
    text: `Week ${weekNumber} plan. ${cycle.strategy}\n\nEffort split — prospecting ${channelMix.prospecting}%, engagement ${channelMix.engagement}%, content ${channelMix.content}%, inbox ${channelMix.inbox}%.\nTargets: ${cycle.targets.map((t) => `${t.metric} ${t.planned}`).join(", ") || "(none set)"}.`,
  });

  pushSseEvent(userId, "autopilot:cycle", {
    weekNumber,
    strategy: cycle.strategy,
    status: cycle.status,
  });

  return cycle;
}

function normaliseMix(mix?: Partial<typeof DEFAULT_CHANNEL_MIX>) {
  const raw = {
    prospecting: mix?.prospecting ?? DEFAULT_CHANNEL_MIX.prospecting,
    content: mix?.content ?? DEFAULT_CHANNEL_MIX.content,
    engagement: mix?.engagement ?? DEFAULT_CHANNEL_MIX.engagement,
    inbox: mix?.inbox ?? DEFAULT_CHANNEL_MIX.inbox,
  };
  const total = raw.prospecting + raw.content + raw.engagement + raw.inbox;
  if (total <= 0) return { ...DEFAULT_CHANNEL_MIX };

  // The prompt asks for percentages summing to 100; rescale rather than trust it.
  return {
    prospecting: Math.round((raw.prospecting / total) * 100),
    content: Math.round((raw.content / total) * 100),
    engagement: Math.round((raw.engagement / total) * 100),
    inbox: Math.round((raw.inbox / total) * 100),
  };
}

function defaultTargets(config: IAgentConfig) {
  const factor = governor.rampFactor(config);
  return [
    { metric: "comments_posted", planned: Math.round(config.weeklyBudgets.comments * factor * 0.5) },
    { metric: "posts_liked", planned: Math.round(config.weeklyBudgets.likes * factor * 0.3) },
    { metric: "profiles_viewed", planned: Math.round(config.weeklyBudgets.profileViews * factor * 0.2) },
  ];
}

function describeBudgets(config: IAgentConfig): string {
  const factor = governor.rampFactor(config);
  return Object.entries(config.weeklyBudgets)
    .map(([k, v]) => `${k}: ${Math.round(v * factor)}/week (ramp factor ${factor})`)
    .join("\n");
}

function describeCapabilities(): string {
  return `The agent can currently execute ONLY these actions: ${IMPLEMENTED_TASK_KINDS.join(", ")}.
Prospecting, connection requests, DMs, inbox handling, and posting are not wired up yet — do not plan targets that depend on them.`;
}

export async function pipelineSummary(userId: string): Promise<string> {
  const counts = await AgentTarget.aggregate<{ _id: string; count: number }>([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: "$stage", count: { $sum: 1 } } },
  ]);

  if (counts.length === 0) return "(pipeline is empty — no targets discovered yet)";
  return counts.map((c) => `${c._id}: ${c.count}`).join(", ");
}

// ── Queue top-up ────────────────────────────────────────────────────────────

/**
 * Keep roughly QUEUE_TARGET tasks queued, apportioned by the cycle's channel
 * mix and capped by the day's remaining budget.
 *
 * Only kinds in IMPLEMENTED_TASK_KINDS are ever queued, so later phases light
 * up by extending that list rather than by editing planner logic.
 */
export async function topUpQueue(
  userId: string,
  config: IAgentConfig,
  goal: IAgentGoal,
  cycle: IAgentCycle
): Promise<number> {
  await connectDB();

  const queued = await AgentTask.countDocuments({
    userId,
    state: { $in: ["queued", "dispatched", "running"] },
  });
  if (queued >= QUEUE_TARGET) return 0;

  const room = QUEUE_TARGET - queued;
  const mix = cycle.channelMix;

  // Map the cycle's channel mix onto concrete kinds. A channel whose kinds are
  // not built yet contributes nothing, so its share must be redistributed —
  // otherwise a plan that allocates 40% to content simply leaves 40% of the
  // queue empty and the agent quietly under-works all week.
  const allPlans: { kind: TaskKind; weight: number }[] = [
    { kind: "comment_on_feed", weight: mix.engagement * 0.6 },
    { kind: "like_post", weight: mix.engagement * 0.4 },
    { kind: "view_target_profile", weight: mix.prospecting },
  ];
  const candidates = allPlans.filter((c) => IMPLEMENTED_TASK_KINDS.includes(c.kind));

  if (candidates.length === 0) return 0;

  const weighted = candidates.filter((c) => c.weight > 0);
  // Every implementable channel scored zero this week (all effort went to
  // unbuilt modules). Spread evenly rather than idling.
  const active = weighted.length > 0 ? weighted : candidates.map((c) => ({ ...c, weight: 1 }));
  const totalWeight = active.reduce((sum, c) => sum + c.weight, 0);

  let created = 0;
  /** Kinds that ran out of budget or had no work available. */
  const exhausted = new Set<TaskKind>();
  const blockedBy = new Map<TaskKind, string>();

  async function fill(kind: TaskKind, count: number): Promise<void> {
    if (count <= 0 || exhausted.has(kind)) return;

    const allowance = await remainingToday(userId, config, kind);
    if (allowance <= 0) {
      exhausted.add(kind);
      blockedBy.set(kind, "daily budget already committed");
      return;
    }

    const n = Math.min(count, allowance, room - created);
    for (let i = 0; i < n; i++) {
      const made = await createTask(userId, config, goal, cycle, kind, created);
      if (!made) {
        // No payload available (e.g. no targets to view) or a dedupe collision.
        exhausted.add(kind);
        blockedBy.set(kind, "nothing available to work on");
        return;
      }
      created++;
      if (created >= room) return;
    }
  }

  // Pass 1 — proportional to the (renormalised) channel mix.
  for (const { kind, weight } of active) {
    if (created >= room) break;
    await fill(kind, Math.max(1, Math.round((weight / totalWeight) * room)));
  }

  // Pass 2 — hand whatever is left to the kinds still producing work, so a dry
  // channel does not cost the whole queue.
  while (created < room) {
    const open = active.filter((c) => !exhausted.has(c.kind));
    if (open.length === 0) break;
    const before = created;
    for (const { kind } of open) {
      if (created >= room) break;
      await fill(kind, 1);
    }
    if (created === before) break; // nothing moved — avoid spinning
  }

  if (created > 0) {
    await journal({
      userId,
      cycleId: cycle._id,
      entryType: "decision",
      phase: "planning",
      text: `Queued ${created} new task${created === 1 ? "" : "s"} for today, weighted to this week's effort split (engagement ${mix.engagement}%, prospecting ${mix.prospecting}%).`,
    });
  } else if (queued === 0) {
    // An empty queue that stays empty is the failure mode a user actually sees
    // ("0 tasks waiting"), so say why — once per cycle per reason, not every tick.
    const reasons = Array.from(blockedBy.entries())
      .map(([kind, why]) => `${kind}: ${why}`)
      .join("; ");
    const text = `I could not queue any work. ${reasons || "No implemented task kind had anything to do."}`;

    const alreadySaid = await AgentJournal.exists({
      userId,
      cycleId: cycle._id,
      text,
    });
    if (!alreadySaid) {
      await journal({
        userId,
        cycleId: cycle._id,
        entryType: "observation",
        phase: "planning",
        text,
      });
    }
  }

  return created;
}

/** Day's ceiling for this kind, minus what is already spent or in flight. */
async function remainingToday(
  userId: string,
  config: IAgentConfig,
  kind: TaskKind
): Promise<number> {
  const budget = governor.TASK_BUDGET[kind];
  if (!budget) return QUEUE_TARGET;

  const ceiling = governor.dailyCeiling(config, budget);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [doneToday, inFlight] = await Promise.all([
    AgentTask.countDocuments({
      userId,
      kind,
      state: "done",
      completedAt: { $gte: startOfDay },
    }),
    AgentTask.countDocuments({
      userId,
      kind,
      state: { $in: ["queued", "dispatched", "running"] },
    }),
  ]);

  return Math.max(0, ceiling - doneToday - inFlight);
}

async function createTask(
  userId: string,
  config: IAgentConfig,
  goal: IAgentGoal,
  cycle: IAgentCycle,
  kind: TaskKind,
  index: number
): Promise<IAgentTask | null> {
  const payload = await buildPayload(userId, goal, kind);
  if (!payload) return null;

  // Spread scheduling across the next few hours. The governor's cooldowns are
  // the real pacing mechanism; this just stops everything being due at once.
  const scheduledFor = new Date(
    Date.now() + index * (5 + Math.random() * 25) * 60 * 1000
  );

  try {
    return await AgentTask.create({
      userId,
      cycleId: cycle._id,
      kind,
      payload,
      state: "queued",
      scheduledFor,
      priority: kind === "view_target_profile" ? 60 : 50,
      rationale: `Week ${cycle.weekNumber} effort split allocates ${kind === "view_target_profile" ? cycle.channelMix.prospecting : cycle.channelMix.engagement}% here.`,
      dedupeKey: payload.dedupeKey as string | undefined,
    });
  } catch (error) {
    // Duplicate dedupeKey — the agent already has this exact action planned.
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

/** Per-kind payload. Returning null means "nothing to work on for this kind". */
async function buildPayload(
  userId: string,
  goal: IAgentGoal,
  kind: TaskKind
): Promise<Record<string, unknown> | null> {
  switch (kind) {
    case "comment_on_feed":
    case "like_post": {
      const keywords = goal.constraints.niche.length
        ? goal.constraints.niche
        : goal.constraints.targetRoles;
      if (keywords.length === 0) return null;

      const keyword = keywords[Math.floor(Math.random() * keywords.length)];
      return {
        keyword,
        // Deliberately no dedupeKey: the specific post is only known at runtime,
        // so duplicate protection happens against the post URL on the result.
        niche: goal.constraints.niche,
        persona: {
          headline: goal.personaSnapshot.headline,
          topSkills: goal.personaSnapshot.topSkills.slice(0, 8),
          voiceNotes: goal.personaSnapshot.voiceNotes,
        },
      };
    }

    case "view_target_profile": {
      const target = await AgentTarget.findOne({
        userId,
        stage: { $in: ["discovered", "warming"] },
        $or: [{ nextTouchAt: { $lte: new Date() } }, { nextTouchAt: { $exists: false } }],
      }).sort({ fitScore: -1 });

      if (!target) return null;

      return {
        targetId: target._id.toString(),
        profileUrl: target.profileUrl,
        name: target.name,
        dedupeKey: `view:${target._id.toString()}:${new Date().toISOString().slice(0, 10)}`,
      };
    }

    default:
      return null;
  }
}

// ── Feed mode ───────────────────────────────────────────────────────────────

/**
 * Queue a batch of feed passes.
 *
 * Feed mode has no goal, no cycle and no channel mix to apportion — the whole
 * decision is "how many comments and how many bare likes, inside today's
 * budget". Each queued task is one trip down the feed: the extension reads it,
 * the server picks the next post it has not touched, and the extension acts on
 * that one post. Working through the feed is what happens across the day's
 * worth of tasks, not inside any single one.
 *
 * Splitting comments and likes into separate tasks (rather than one task that
 * does both) is deliberate: the governor prices, paces and rate-limits per
 * action, so a comment that also likes would spend two budgets under one
 * cooldown. The extension does like the post it comments on — that pairing is
 * reported in the result and charged to both counters there.
 */
export async function topUpFeedQueue(
  userId: string,
  config: IAgentConfig
): Promise<number> {
  await connectDB();

  const queued = await AgentTask.countDocuments({
    userId,
    state: { $in: ["queued", "dispatched", "running"] },
  });
  if (queued >= QUEUE_TARGET) return 0;

  const room = QUEUE_TARGET - queued;
  const settings = { ...DEFAULT_FEED_SETTINGS, ...(config.feed ?? {}) };
  const ratio = Math.min(1, Math.max(0, settings.commentRatio));

  // Round the comment share up: on a small queue the user would rather see one
  // comment and one like than two likes.
  const wantComments = Math.min(room, Math.ceil(room * ratio));

  const [commentRoom, likeRoom] = await Promise.all([
    remainingToday(userId, config, "comment_on_feed"),
    remainingToday(userId, config, "like_post"),
  ]);

  const comments = Math.min(wantComments, commentRoom);
  // Whatever the comment budget could not absorb goes to likes rather than
  // leaving the queue half empty — a spent comment budget should slow the agent
  // down, not stop it.
  const likes = Math.min(room - comments, likeRoom);

  let created = 0;
  const made: Record<string, number> = { comment_on_feed: 0, like_post: 0 };

  for (const [kind, count] of [
    ["comment_on_feed", comments],
    ["like_post", likes],
  ] as [TaskKind, number][]) {
    for (let i = 0; i < count && created < room; i++) {
      const task = await createFeedTask(userId, settings, kind, created);
      if (!task) break;
      made[kind]++;
      created++;
    }
  }

  if (created > 0) {
    await journal({
      userId,
      entryType: "decision",
      phase: "planning",
      text: `Queued ${created} feed pass${created === 1 ? "" : "es"} — ${made.comment_on_feed} to read and comment on, ${made.like_post} to read and like. I work down the feed one post at a time and skip anything I have nothing real to say about.`,
    });
  } else if (queued === 0) {
    const why =
      commentRoom <= 0 && likeRoom <= 0
        ? "Today's comment and like budgets are both spent."
        : "Nothing could be queued this tick.";
    const text = `${why} I will pick the feed back up when the budget resets.`;

    // Once per day, not once per tick — this fires every 5 minutes otherwise.
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const alreadySaid = await AgentJournal.exists({
      userId,
      text,
      createdAt: { $gte: since },
    });
    if (!alreadySaid) {
      await journal({ userId, entryType: "observation", phase: "planning", text });
    }
  }

  return created;
}

async function createFeedTask(
  userId: string,
  settings: { postsPerSweep: number; pitchOnJobPosts: boolean },
  kind: TaskKind,
  index: number
): Promise<IAgentTask | null> {
  // Spread the batch over the next few hours. The governor's cooldowns are the
  // real pacing; this only stops everything coming due at once.
  const scheduledFor = new Date(
    Date.now() + index * (5 + Math.random() * 25) * 60 * 1000
  );

  return AgentTask.create({
    userId,
    kind,
    // No dedupeKey: which post this lands on is only known at runtime, so
    // duplicate protection happens against the post URL in /generate.
    payload: {
      source: "feed",
      postsPerSweep: settings.postsPerSweep,
      pitchOnJobPosts: settings.pitchOnJobPosts,
      // The comment task likes the post it comments on, the way a person does.
      alsoLike: kind === "comment_on_feed",
    },
    state: "queued",
    scheduledFor,
    priority: kind === "comment_on_feed" ? 60 : 40,
    rationale:
      kind === "comment_on_feed"
        ? "Read the feed, find a post worth a real response, like it and comment."
        : "Read the feed and like a post worth being seen on.",
  });
}

// ── Selection & dispatch ────────────────────────────────────────────────────

/** Requeue tasks the extension took but never reported on. */
async function reclaimStuckTasks(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - DISPATCH_TIMEOUT_MS);
  const stuck = await AgentTask.find({
    userId,
    state: { $in: ["dispatched", "running"] },
    dispatchedAt: { $lt: cutoff },
  });

  for (const task of stuck) {
    task.attempts += 1;
    if (task.attempts >= task.maxAttempts) {
      task.state = "failed";
      task.error = "No result reported before the dispatch timeout";
      task.completedAt = new Date();
    } else {
      task.state = "queued";
      // Exponential backoff so a persistently failing task stops hogging the queue.
      task.scheduledFor = new Date(Date.now() + 2 ** task.attempts * 60 * 1000);
    }
    await task.save();
  }

  if (stuck.length > 0) {
    await journal({
      userId,
      entryType: "observation",
      phase: "safety",
      text: `${stuck.length} task${stuck.length === 1 ? "" : "s"} never reported back within ${DISPATCH_TIMEOUT_MS / 60000} minutes. Requeued them with backoff.`,
    });
  }
}

export async function pickNextTask(userId: string): Promise<IAgentTask | null> {
  return AgentTask.findOne({
    userId,
    state: "queued",
    scheduledFor: { $lte: new Date() },
  }).sort({ priority: -1, scheduledFor: 1 });
}

export async function dispatch(userId: string, task: IAgentTask): Promise<boolean> {
  // Claim the task atomically so two overlapping ticks can never send it twice.
  const claimed = await AgentTask.findOneAndUpdate(
    { _id: task._id, state: "queued" },
    { $set: { state: "dispatched", dispatchedAt: new Date() }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!claimed) return false;

  const sent = sendToExtension(userId, {
    command: "RUN_TASK",
    taskId: claimed._id.toString(),
    kind: claimed.kind,
    payload: claimed.payload,
  });

  if (!sent) {
    claimed.state = "queued";
    claimed.dispatchedAt = undefined;
    await claimed.save();
    return false;
  }

  pushSseEvent(userId, "autopilot:task", {
    taskId: claimed._id.toString(),
    kind: claimed.kind,
    state: "dispatched",
    rationale: claimed.rationale,
  });

  return true;
}

// ── The tick ────────────────────────────────────────────────────────────────

export interface TickResult {
  ran: boolean;
  dispatched?: string;
  blocked?: string;
  reason?: string;
}

export async function tick(userId: string): Promise<TickResult> {
  await connectDB();

  const config = await AgentConfig.findOne({ userId });
  if (!config?.enabled) return { ran: false, reason: "disabled" };

  config.lastTickAt = new Date();
  await config.save();

  if (config.pausedUntil && config.pausedUntil > new Date()) {
    return { ran: false, blocked: "paused", reason: config.pauseReason };
  }

  await reclaimStuckTasks(userId);

  if (config.mode === "feed") {
    // Feed mode skips the whole goal/cycle stack. There is nothing to decompose
    // and nothing to review: the plan is "read the feed and respond well".
    await topUpFeedQueue(userId, config);
  } else {
    const goal = await ensureGoal(userId, config);
    if (!goal) return { ran: false, reason: "no goal" };

    const cycle = await ensureCycle(userId, config, goal);
    if (!cycle) return { ran: false, reason: "no cycle" };

    await topUpQueue(userId, config, goal, cycle);
  }

  const task = await pickNextTask(userId);
  if (!task) return { ran: false, reason: "queue empty" };

  const verdict = await governor.check({ userId, kind: task.kind, config });
  if (!verdict.allowed) {
    // Push the task out to when it could actually run, so the queue does not
    // spin on a blocked item every tick.
    if (verdict.nextEligibleAt) {
      task.scheduledFor = verdict.nextEligibleAt;
      await task.save();
    }
    return { ran: false, blocked: verdict.gate, reason: verdict.reason };
  }

  const ok = await dispatch(userId, task);
  return ok
    ? { ran: true, dispatched: task.kind }
    : { ran: false, reason: "dispatch failed" };
}
