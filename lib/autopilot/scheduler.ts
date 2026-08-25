/**
 * The clock.
 *
 * A single in-process interval that wakes every few minutes, finds every user
 * with autopilot enabled, and runs one planner tick for each. This is what
 * makes the system autonomous rather than user-triggered.
 *
 * It deliberately holds no state of consequence: everything the planner needs
 * is re-read from Mongo on each tick, so a restart, a redeploy, or a crash
 * costs at most one tick.
 *
 * Started once from server.ts, alongside the WebSocket servers.
 */

import connectDB from "@/lib/db/connection";
import AgentConfig from "@/lib/db/models/agent-config";
import { tick } from "./planner";
import { ensureAutopilotIndexes } from "./bootstrap";

const DEFAULT_TICK_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
/** Guards against a slow tick overlapping the next one. */
let running = false;
let tickCount = 0;

export function getTickIntervalMs(): number {
  const raw = parseInt(process.env.AUTOPILOT_TICK_MS || "", 10);
  if (Number.isFinite(raw) && raw >= 5_000) return raw;
  return DEFAULT_TICK_MS;
}

export function isAutopilotEnabled(): boolean {
  return process.env.AUTOPILOT_ENABLED !== "false";
}

/**
 * One pass over every enabled user.
 * Exported so the API can force an immediate pass after the user hits Start.
 */
export async function runOnce(): Promise<{ users: number; dispatched: number }> {
  await connectDB();

  // Migrates the AgentTask dedupe index on an existing deployment. No-op after
  // the first successful pass.
  await ensureAutopilotIndexes();

  const configs = await AgentConfig.find({ enabled: true }).select("userId").lean();
  let dispatched = 0;

  for (const config of configs) {
    const userId = config.userId.toString();
    try {
      const result = await tick(userId);
      if (result.ran) dispatched++;
    } catch (error) {
      // One user's failure must never stop the others or kill the interval.
      console.error(`[Autopilot] Tick failed for user ${userId}:`, error);
    }
  }

  return { users: configs.length, dispatched };
}

export function startAutopilotScheduler(): void {
  if (timer) return;

  if (!isAutopilotEnabled()) {
    console.log("[Autopilot] Scheduler disabled (AUTOPILOT_ENABLED=false)");
    return;
  }

  const intervalMs = getTickIntervalMs();

  const pass = async () => {
    if (running) {
      console.warn("[Autopilot] Previous tick still running — skipping this one");
      return;
    }
    running = true;
    tickCount++;

    try {
      const { users, dispatched } = await runOnce();
      if (users > 0) {
        console.log(
          `[Autopilot] Tick ${tickCount}: ${users} active user(s), ${dispatched} task(s) dispatched`
        );
      }
    } catch (error) {
      console.error("[Autopilot] Scheduler pass failed:", error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(pass, intervalMs);
  // Never hold the process open on this timer alone.
  timer.unref?.();

  console.log(`[Autopilot] Scheduler started — ticking every ${intervalMs / 1000}s`);

  // First pass shortly after boot, once the DB pool has had a moment to warm.
  setTimeout(pass, 10_000).unref?.();
}

export function stopAutopilotScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Autopilot] Scheduler stopped");
  }
}

export function getSchedulerStatus() {
  return {
    running: timer !== null,
    inFlight: running,
    tickCount,
    intervalMs: getTickIntervalMs(),
    enabled: isAutopilotEnabled(),
  };
}
