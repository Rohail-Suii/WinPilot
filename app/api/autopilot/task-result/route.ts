/**
 * Where the extension reports back.
 *
 * This is the only place task state, usage counters, pipeline stages and the
 * journal are written from an executed action — so a result that never arrives
 * simply leaves the task to be reclaimed by the planner, and a result that does
 * arrive updates everything atomically from one payload.
 *
 * It is also where the circuit breaker lives: any LinkedIn pushback signal in
 * the reported error pauses the whole agent for six hours.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { resolveRequestUserId } from "@/lib/utils/get-actor-id";
import AgentTask from "@/lib/db/models/agent-task";
import AgentTarget from "@/lib/db/models/agent-target";
import ActivityLog from "@/lib/db/models/activity-log";
import { incrementUsage } from "@/lib/anti-detection/rate-limiter";
import { journal } from "@/lib/autopilot/journal";
import { pushSseEvent } from "@/lib/sse";
import * as governor from "@/lib/autopilot/governor";
import type { TaskKind } from "@/lib/db/models/agent-config";

const resultSchema = z.object({
  taskId: z.string().length(24),
  ok: z.boolean(),
  /** Free-form per-kind detail: postUrl, comment text, profile data, etc. */
  result: z.record(z.string(), z.unknown()).default({}),
  error: z.string().max(1000).optional(),
  /** Set by the extension when it detects a captcha/checkpoint/session loss. */
  signal: z.string().max(200).optional(),
});

/** `DailyUsage.actions` counter each task kind spends on success. */
const USAGE_FOR_KIND: Partial<Record<TaskKind, string>> = {
  comment_on_feed: "comments",
  engage_target_post: "comments",
  like_post: "likes",
  warm_dormant_targets: "likes",
  view_target_profile: "profileViews",
  send_connection: "connectionRequests",
  follow_target: "connectionRequests",
  send_dm: "messages",
  reply_thread: "messages",
  followup_target: "messages",
  publish_post: "posts",
  discover_targets: "scrapes",
  scan_inbox: "scrapes",
  scan_notifications: "scrapes",
  check_invite_accepted: "scrapes",
  measure_post: "scrapes",
  audit_own_profile: "scrapes",
};

/** Where the agent found the post, phrased for a human reading the journal. */
function foundVia(result: Record<string, unknown>): string {
  if (result.source === "feed") return " off my feed";
  return result.keyword ? ` (found via "${result.keyword}")` : "";
}

/**
 * One engagement inside a feed sweep.
 *
 * Feed mode works several posts in a single pass, so a result can carry a list
 * of these instead of a single post's fields.
 */
interface Engagement {
  postUrl?: string;
  postKey?: string;
  authorName?: string;
  liked?: boolean;
  commented?: boolean;
  comment?: string;
  postType?: string;
  angle?: string;
  isPitch?: boolean;
  error?: string;
}

/** The per-post engagements of a feed sweep, or [] for a single-post result. */
function engagementsIn(result: Record<string, unknown>): Engagement[] {
  const list = result.engagements;
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is Engagement => Boolean(e) && typeof e === "object");
}

/** Human-readable one-liner for the journal, per kind. */
function describe(kind: TaskKind, result: Record<string, unknown>): string {
  const author = (result.authorName as string) || "someone";
  const url = (result.postUrl as string) || (result.profileUrl as string) || "";

  // A sweep reports itself rather than one post: the individual comments each
  // get their own journal entry below, so this is the header over them.
  const sweep = engagementsIn(result);
  if (sweep.length > 0) {
    const acted = sweep.filter((e) => e.liked || e.commented);
    const commented = acted.filter((e) => e.commented).length;
    const failed = sweep.length - acted.length;
    return `Worked down the feed: ${acted.length} post${acted.length === 1 ? "" : "s"} engaged with, ${commented} of them commented on.${failed > 0 ? ` ${failed} I could not act on.` : ""}`;
  }

  switch (kind) {
    case "comment_on_feed":
    case "engage_target_post": {
      const kindOfPost = result.postType ? ` It read as a ${result.postType} post.` : "";
      // The angle is the model's own one-line justification. Surfacing it is
      // what lets the user judge the agent's taste rather than only its output.
      const angle = result.angle ? ` My angle: ${String(result.angle).slice(0, 200)}` : "";
      const pitched = result.isPitch ? " I pitched myself on it, since they are hiring." : "";
      const liked = result.liked ? " Liked it first." : "";
      return `Commented on ${author}'s post${foundVia(result)}.${kindOfPost}${pitched}${liked}${angle}\n\n"${String(result.comment || "").slice(0, 400)}"${url ? `\n${url}` : ""}`;
    }
    case "like_post":
      return `Liked ${author}'s post${foundVia(result)}.${url ? ` ${url}` : ""}`;
    case "view_target_profile":
      return `Viewed ${(result.name as string) || "a target's"} profile — they get a notification, which is the cheapest way onto their radar.${url ? ` ${url}` : ""}`;
    default:
      return `Completed ${kind}.`;
  }
}

/** Move the pipeline forward when an action implies a stage change. */
async function advanceTarget(
  userId: string,
  kind: TaskKind,
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
  taskId: string
): Promise<void> {
  const targetId = (payload.targetId as string) || (result.targetId as string);
  if (!targetId) return;

  const target = await AgentTarget.findOne({ _id: targetId, userId });
  if (!target) return;

  switch (kind) {
    case "view_target_profile":
      target.touchpoints.push({
        kind: "profile_view",
        at: new Date(),
        taskId,
        url: target.profileUrl,
      });
      if (target.stage === "discovered") target.stage = "warming";
      // A profile view is a light touch; wait a day before the next one.
      target.nextTouchAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      break;

    case "engage_target_post":
      target.touchpoints.push({
        kind: "post_comment",
        at: new Date(),
        taskId,
        content: String(result.comment || ""),
        url: String(result.postUrl || ""),
      });
      if (target.stage === "discovered" || target.stage === "warming") {
        target.stage = "warming";
      }
      target.lastPostSeenUrl = String(result.postUrl || target.lastPostSeenUrl || "");
      target.nextTouchAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      break;

    default:
      return;
  }

  await target.save();
}

export async function POST(req: Request) {
  try {
    const userId = await resolveRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = resultSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid result payload" }, { status: 400 });
    }

    const { taskId, ok, result, error, signal } = parsed.data;

    await connectDB();

    const task = await AgentTask.findOne({ _id: taskId, userId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // A result for an already-finished task is a duplicate report, not an error.
    if (["done", "failed", "skipped"].includes(task.state)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // ── Circuit breaker ─────────────────────────────────────────────────────
    const tripText = signal || error || "";
    if (governor.isTripSignal(tripText)) {
      const until = await governor.trip(
        userId,
        `LinkedIn pushback while running ${task.kind}: ${tripText.slice(0, 150)}`
      );

      task.state = "failed";
      task.error = tripText.slice(0, 1000);
      task.completedAt = new Date();
      await task.save();

      await journal({
        userId,
        cycleId: task.cycleId,
        entryType: "error",
        phase: "safety",
        text: `LinkedIn pushed back while I was running ${task.kind}: "${tripText.slice(0, 200)}". I have stopped everything until ${until.toISOString()} rather than risk the account. Nothing will be dispatched in the meantime.`,
        refs: { taskId },
      });

      pushSseEvent(userId, "autopilot:paused", {
        until: until.toISOString(),
        reason: tripText.slice(0, 200),
      });

      return NextResponse.json({ ok: true, paused: true, until });
    }

    // ── Deliberate skip ─────────────────────────────────────────────────────
    // The agent looked and decided not to act — nothing worth commenting on, a
    // post already liked, a generated comment that came back as boilerplate.
    // That is a valid outcome, not a failure, and it spends no LinkedIn budget.
    if (ok && result.skipped === true) {
      task.state = "skipped";
      task.result = result;
      task.completedAt = new Date();
      await task.save();

      await journal({
        userId,
        cycleId: task.cycleId,
        entryType: "observation",
        phase: "engagement",
        text: `Skipped a ${task.kind}: ${String(result.reason || "no reason given")}. Doing nothing beats posting something generic.`,
        refs: { taskId },
      });

      pushSseEvent(userId, "autopilot:task", {
        taskId,
        kind: task.kind,
        state: "skipped",
        reason: result.reason,
      });

      return NextResponse.json({ ok: true, skipped: true });
    }

    // ── Success ─────────────────────────────────────────────────────────────
    if (ok) {
      task.state = "done";
      task.result = result;
      task.completedAt = new Date();
      await task.save();

      const usageKey = USAGE_FOR_KIND[task.kind];
      const sweep = engagementsIn(result).filter((e) => e.liked || e.commented);

      if (sweep.length > 0) {
        // A feed sweep is many real LinkedIn actions under one task. Charging
        // it once would let the day's true action volume run far above what
        // the user configured, so every post is counted separately.
        for (const item of sweep) {
          if (item.commented && usageKey) {
            await incrementUsage(userId, usageKey as Parameters<typeof incrementUsage>[1]);
          }
          if (item.liked) {
            await incrementUsage(userId, "likes" as Parameters<typeof incrementUsage>[1]);
          }
        }
      } else {
        if (usageKey) {
          await incrementUsage(userId, usageKey as Parameters<typeof incrementUsage>[1]);
        }

        // Feed mode likes the post it comments on, the way a person does. That
        // is a second real LinkedIn action, so it has to be charged to the like
        // budget too — otherwise the governor undercounts and the day's true
        // action volume runs above what the user configured.
        if (result.liked === true && usageKey !== "likes") {
          await incrementUsage(userId, "likes" as Parameters<typeof incrementUsage>[1]);
        }
      }

      await advanceTarget(userId, task.kind, task.payload, result, taskId);

      await journal({
        userId,
        cycleId: task.cycleId,
        entryType: "action",
        phase: "engagement",
        text: describe(task.kind, result),
        refs: { taskId, targetId: task.payload.targetId as string | undefined },
      });

      // Each comment gets its own entry under the sweep's header, so the user
      // can still read and judge what was actually said post by post.
      for (const item of sweep) {
        if (!item.comment) continue;
        const pitched = item.isPitch ? " I pitched myself on it, since they are hiring." : "";
        const angle = item.angle ? ` My angle: ${String(item.angle).slice(0, 200)}` : "";
        await journal({
          userId,
          cycleId: task.cycleId,
          entryType: "action",
          phase: "engagement",
          text: `Commented on ${item.authorName || "someone"}'s post off my feed.${item.postType ? ` It read as a ${item.postType} post.` : ""}${pitched}${item.liked ? " Liked it first." : ""}${angle}\n\n"${String(item.comment).slice(0, 400)}"${item.postUrl?.startsWith("http") ? `\n${item.postUrl}` : ""}`,
          refs: { taskId },
        });
      }

      if (sweep.length > 0) {
        // One log row per post. This is also the dedupe index the next sweep
        // reads back through /generate — keyed on postKey, because the
        // redesigned feed gives most cards no permalink to key on.
        await ActivityLog.insertMany(
          sweep.map((item) => ({
            userId,
            action: task.kind,
            module: "autopilot",
            details: { taskId, source: "feed", ...item },
            status: "success",
            linkedinUrl: item.postKey || item.postUrl || undefined,
          }))
        );
      } else {
        await ActivityLog.create({
          userId,
          action: task.kind,
          module: "autopilot",
          details: { taskId, ...result },
          status: "success",
          linkedinUrl: (result.postUrl as string) || (result.profileUrl as string) || undefined,
        });
      }

      pushSseEvent(userId, "autopilot:task", {
        taskId,
        kind: task.kind,
        state: "done",
        result,
      });

      return NextResponse.json({ ok: true });
    }

    // ── Failure — retry with backoff until maxAttempts ───────────────────────
    const exhausted = task.attempts >= task.maxAttempts;
    task.error = error?.slice(0, 1000) || "Unknown failure";

    if (exhausted) {
      task.state = "failed";
      task.completedAt = new Date();
    } else {
      task.state = "queued";
      task.scheduledFor = new Date(Date.now() + 2 ** task.attempts * 60 * 1000);
    }
    await task.save();

    await journal({
      userId,
      cycleId: task.cycleId,
      entryType: exhausted ? "error" : "observation",
      phase: "engagement",
      text: exhausted
        ? `Gave up on ${task.kind} after ${task.attempts} attempts. Last error: ${task.error}`
        : `${task.kind} failed (${task.error}). Retrying in ${2 ** task.attempts} minutes.`,
      refs: { taskId },
    });

    if (exhausted) {
      await ActivityLog.create({
        userId,
        action: task.kind,
        module: "autopilot",
        details: { taskId, error: task.error },
        status: "failure",
      });
    }

    pushSseEvent(userId, "autopilot:task", {
      taskId,
      kind: task.kind,
      state: task.state,
      error: task.error,
    });

    return NextResponse.json({ ok: true, retrying: !exhausted });
  } catch (error) {
    console.error("[Autopilot/TaskResult] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
