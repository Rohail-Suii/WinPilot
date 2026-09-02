/**
 * The sender's clock.
 *
 * A separate interval from the autopilot scheduler, because the two are paced
 * by different things: the planner ticks every five minutes against LinkedIn's
 * tolerance, while the sender ticks against Gmail's and the recipient's. Each
 * pass sends at most one application per user, so the interval is the floor on
 * spacing and the user's `minGapMinutes` is the real setting on top of it.
 *
 * Like the autopilot scheduler, it holds no state: everything is re-read from
 * Mongo each pass, so a restart costs at most one tick.
 */

import { processDueOutreach, reclaimStuckOutreach } from "./sender";

const DEFAULT_TICK_MS = 2 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;
let passes = 0;

export function getOutreachTickMs(): number {
  const raw = parseInt(process.env.OUTREACH_TICK_MS || "", 10);
  if (Number.isFinite(raw) && raw >= 30_000) return raw;
  return DEFAULT_TICK_MS;
}

export function isOutreachWorkerEnabled(): boolean {
  return process.env.OUTREACH_ENABLED !== "false";
}

export function startOutreachWorker(): void {
  if (timer) return;

  if (!isOutreachWorkerEnabled()) {
    console.log("[Outreach] Sender disabled (OUTREACH_ENABLED=false)");
    return;
  }

  const intervalMs = getOutreachTickMs();

  const pass = async () => {
    // A slow SMTP conversation must not overlap the next pass — that is how the
    // same record gets claimed twice.
    if (running) return;
    running = true;
    passes++;

    try {
      const reclaimed = await reclaimStuckOutreach();
      if (reclaimed > 0) {
        console.log(`[Outreach] Reclaimed ${reclaimed} application(s) stuck mid-send`);
      }

      const { users, sent } = await processDueOutreach();
      if (sent > 0) {
        console.log(`[Outreach] Pass ${passes}: ${sent} application(s) sent across ${users} user(s)`);
      }
    } catch (error) {
      console.error("[Outreach] Sender pass failed:", error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(pass, intervalMs);
  timer.unref?.();

  console.log(`[Outreach] Sender started — checking every ${intervalMs / 1000}s`);

  // Slightly after the autopilot's first pass, so boot is not three DB storms
  // landing at once.
  setTimeout(pass, 20_000).unref?.();
}

export function stopOutreachWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[Outreach] Sender stopped");
  }
}

export function getOutreachWorkerStatus() {
  return {
    running: timer !== null,
    inFlight: running,
    passes,
    intervalMs: getOutreachTickMs(),
    enabled: isOutreachWorkerEnabled(),
  };
}
