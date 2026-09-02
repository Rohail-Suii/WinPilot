/**
 * The Safety Governor.
 *
 * Every task passes through `check()` before it is dispatched. This is the
 * control that keeps the account alive, and it is deliberately the most
 * conservative component in the system: when a gate is uncertain, it blocks.
 *
 * Gates, in order — cheapest and most decisive first:
 *   1. paused        — a circuit breaker tripped, or the user paused it
 *   2. working hours — the user's own timezone, active days only
 *   3. autonomy      — this kind is set to "review" rather than "auto"
 *   4. budget        — weekly ceiling, scaled by the ramp-up factor
 *   5. cooldown      — minimum gap since the last action of the same category
 *   6. extension     — nothing can execute if the browser is not connected
 */

import connectDB from "@/lib/db/connection";
import AgentConfig, {
  autonomyFor,
  type IAgentConfig,
  type TaskKind,
} from "@/lib/db/models/agent-config";
import AgentTask from "@/lib/db/models/agent-task";
import DailyUsage from "@/lib/db/models/daily-usage";
import { COOLDOWN_PERIODS } from "@/lib/anti-detection/human-simulator";
import { isExtensionConnected } from "@/lib/websocket/server";

/** Budget/usage category a task kind draws down. */
export type BudgetKey =
  | "connects"
  | "comments"
  | "dms"
  | "posts"
  | "likes"
  | "profileViews"
  | "scrapes";

/** `DailyUsage.actions` key each budget maps onto. */
const USAGE_KEY: Record<BudgetKey, string> = {
  connects: "connectionRequests",
  comments: "comments",
  dms: "messages",
  posts: "posts",
  likes: "likes",
  profileViews: "profileViews",
  scrapes: "scrapes",
};

/** Cooldown bucket in COOLDOWN_PERIODS each budget maps onto. */
const COOLDOWN_KEY: Record<BudgetKey, keyof typeof COOLDOWN_PERIODS> = {
  connects: "connectionRequests",
  comments: "comments",
  dms: "messages",
  posts: "posts",
  likes: "likes",
  profileViews: "profileViews",
  scrapes: "scrapes",
};

/**
 * Which budget each task kind spends. Kinds absent from this map are pure
 * bookkeeping (planning, reviewing, classifying) and cost no LinkedIn action.
 */
export const TASK_BUDGET: Partial<Record<TaskKind, BudgetKey>> = {
  discover_targets: "scrapes",
  view_target_profile: "profileViews",
  send_connection: "connects",
  check_invite_accepted: "scrapes",
  follow_target: "connects",
  engage_target_post: "comments",
  comment_on_feed: "comments",
  like_post: "likes",
  scan_notifications: "scrapes",
  warm_dormant_targets: "likes",
  scan_inbox: "scrapes",
  reply_thread: "dms",
  send_dm: "dms",
  followup_target: "dms",
  publish_post: "posts",
  measure_post: "scrapes",
  audit_own_profile: "scrapes",
  apply_profile_edit: "scrapes",
};

export interface GovernorVerdict {
  allowed: boolean;
  /** Machine-readable gate that blocked, for the journal and the dashboard. */
  gate?:
    | "paused"
    | "working_hours"
    | "autonomy"
    | "budget"
    | "cooldown"
    | "extension_offline";
  reason?: string;
  /** Earliest time this task could pass. Undefined means "unknown / try next tick". */
  nextEligibleAt?: Date;
}

const ALLOWED: GovernorVerdict = { allowed: true };

// ── Working hours, in the user's timezone ───────────────────────────────────

/**
 * Hour-of-day and day-of-week as they are RIGHT NOW in `timezone`.
 *
 * The existing `isWithinWorkingHours` in lib/anti-detection/session-manager.ts
 * reads the *server's* local time, which on Render is UTC — so a 9am-9pm window
 * would fire at 2am for a user in Karachi. Autopilot needs the user's own clock.
 */
export function localTimeIn(timezone: string, now = new Date()): { hour: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);

    const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
    const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return {
      // Intl renders midnight as "24" in some locales/engines
      hour: parseInt(hourPart, 10) % 24,
      day: Math.max(0, days.indexOf(weekdayPart)),
    };
  } catch {
    // Unknown timezone string — fall back to server time rather than blocking forever
    return { hour: now.getHours(), day: now.getDay() };
  }
}

export function isWithinUserHours(config: IAgentConfig, now = new Date()): boolean {
  const { hour, day } = localTimeIn(config.workingHours.timezone, now);
  if (!config.workingHours.activeDays.includes(day)) return false;
  return hour >= config.workingHours.start && hour < config.workingHours.end;
}

/** Start of the next working window, so the dashboard can say when it wakes up. */
export function nextWindowStart(config: IAgentConfig, now = new Date()): Date {
  const probe = new Date(now.getTime());
  // Step forward hour by hour; a week of hours is a tiny loop and avoids
  // hand-rolling timezone arithmetic that DST would break.
  for (let i = 1; i <= 24 * 8; i++) {
    probe.setTime(now.getTime() + i * 60 * 60 * 1000);
    if (isWithinUserHours(config, probe)) return probe;
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

// ── Ramp-up ─────────────────────────────────────────────────────────────────

/**
 * Week 1 at 40% of budget, week 2 at 70%, week 3+ at 100%.
 * A brand-new activity pattern on an established account is the classic trigger
 * for a restriction, so the agent eases in rather than starting at full tilt.
 */
export function rampFactor(config: IAgentConfig, now = new Date()): number {
  if (!config.rampStartedAt) return 0.4;
  const weeks = Math.floor(
    (now.getTime() - config.rampStartedAt.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  if (weeks <= 0) return 0.4;
  if (weeks === 1) return 0.7;
  return 1;
}

/** Daily ceiling for a budget: the weekly budget spread over active days, ramped. */
export function dailyCeiling(config: IAgentConfig, budget: BudgetKey, now = new Date()): number {
  if (budget === "scrapes") return Math.floor(200 * rampFactor(config, now));

  const weekly = config.weeklyBudgets[budget] ?? 0;
  const activeDays = Math.max(1, config.workingHours.activeDays.length);
  return Math.max(1, Math.floor((weekly / activeDays) * rampFactor(config, now)));
}

// ── Usage & cooldown ────────────────────────────────────────────────────────

function todayKeyIn(timezone: string, now = new Date()): string {
  try {
    // en-CA renders as YYYY-MM-DD, matching the existing DailyUsage.date format
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  } catch {
    return now.toISOString().split("T")[0];
  }
}

async function usedToday(
  userId: string,
  budget: BudgetKey,
  timezone: string
): Promise<number> {
  const usage = await DailyUsage.findOne({
    userId,
    date: todayKeyIn(timezone),
  }).lean();
  const actions = (usage?.actions ?? {}) as Record<string, number>;
  return actions[USAGE_KEY[budget]] ?? 0;
}

/**
 * How many more actions of this kind today's ceiling still allows.
 *
 * Counts real LinkedIn actions from DailyUsage, not queued tasks — a feed
 * sweep performs many actions under one task, so task counts stopped being a
 * usable proxy for spend once feed mode started working several posts per
 * pass.
 */
export async function remainingActionsToday(
  userId: string,
  config: IAgentConfig,
  budget: BudgetKey,
  now = new Date()
): Promise<number> {
  const ceiling = dailyCeiling(config, budget, now);
  const used = await usedToday(userId, budget, config.workingHours.timezone);
  return Math.max(0, ceiling - used);
}

/**
 * When the cooldown for this budget category expires.
 * Uses the minimum of the configured window — the extension adds its own
 * human-shaped jitter on top, so the governor only enforces the floor.
 */
async function cooldownUntil(
  userId: string,
  budget: BudgetKey,
  now = new Date()
): Promise<Date | null> {
  const period = COOLDOWN_PERIODS[COOLDOWN_KEY[budget]];
  if (!period) return null;

  const kinds = (Object.keys(TASK_BUDGET) as TaskKind[]).filter(
    (k) => TASK_BUDGET[k] === budget
  );

  const last = await AgentTask.findOne({
    userId,
    kind: { $in: kinds },
    state: "done",
    completedAt: { $exists: true },
  })
    .sort({ completedAt: -1 })
    .select("completedAt")
    .lean();

  if (!last?.completedAt) return null;

  const eligible = new Date(last.completedAt.getTime() + period.min);
  return eligible > now ? eligible : null;
}

// ── The gate ────────────────────────────────────────────────────────────────

export interface CheckInput {
  userId: string;
  kind: TaskKind;
  config?: IAgentConfig;
  now?: Date;
}

export async function check(input: CheckInput): Promise<GovernorVerdict> {
  await connectDB();
  const now = input.now ?? new Date();

  const config =
    input.config ?? (await AgentConfig.findOne({ userId: input.userId }));
  if (!config) {
    return { allowed: false, gate: "paused", reason: "No autopilot config" };
  }

  // 1. Paused — a tripped circuit breaker or a manual stop
  if (config.pausedUntil && config.pausedUntil > now) {
    return {
      allowed: false,
      gate: "paused",
      reason: config.pauseReason || "Autopilot is paused",
      nextEligibleAt: config.pausedUntil,
    };
  }

  // 2. Working hours, in the user's own timezone
  if (!isWithinUserHours(config, now)) {
    return {
      allowed: false,
      gate: "working_hours",
      reason: `Outside working hours (${config.workingHours.start}:00-${config.workingHours.end}:00 ${config.workingHours.timezone})`,
      nextEligibleAt: nextWindowStart(config, now),
    };
  }

  // 3. Autonomy — "review" parks the task instead of sending it
  if (autonomyFor(config, input.kind) === "review") {
    return {
      allowed: false,
      gate: "autonomy",
      reason: `${input.kind} is set to manual review`,
    };
  }

  const budget = TASK_BUDGET[input.kind];

  // Bookkeeping tasks cost no LinkedIn action — they skip budget and cooldown,
  // but still need the extension for anything that touches the DOM.
  if (budget) {
    // 4. Budget
    const ceiling = dailyCeiling(config, budget, now);
    const used = await usedToday(input.userId, budget, config.workingHours.timezone);
    if (used >= ceiling) {
      return {
        allowed: false,
        gate: "budget",
        reason: `Daily ${budget} budget spent (${used}/${ceiling})`,
        nextEligibleAt: nextWindowStart(config, now),
      };
    }

    // 5. Cooldown
    const until = await cooldownUntil(input.userId, budget, now);
    if (until) {
      return {
        allowed: false,
        gate: "cooldown",
        reason: `Cooling down on ${budget} until ${until.toISOString()}`,
        nextEligibleAt: until,
      };
    }
  }

  // 6. Extension online
  if (!isExtensionConnected(input.userId)) {
    return {
      allowed: false,
      gate: "extension_offline",
      reason: "Extension is not connected — work stays queued",
    };
  }

  return ALLOWED;
}

// ── Circuit breaker ─────────────────────────────────────────────────────────

/** Result signals that mean LinkedIn pushed back and the agent must stop. */
const TRIP_SIGNALS = [
  "checkpoint",
  "captcha",
  "challenge",
  "unusual activity",
  "restricted",
  "session lost",
  "not logged in",
  "429",
  "too many requests",
  "rate limit",
];

export function isTripSignal(text: string | undefined | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return TRIP_SIGNALS.some((signal) => lower.includes(signal));
}

export const TRIP_PAUSE_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Trip the breaker. Idempotent: an existing longer pause is never shortened,
 * so repeated failures cannot accidentally resume the agent early.
 */
export async function trip(
  userId: string,
  reason: string,
  durationMs = TRIP_PAUSE_MS
): Promise<Date> {
  await connectDB();
  const until = new Date(Date.now() + durationMs);

  const config = await AgentConfig.findOne({ userId });
  if (config?.pausedUntil && config.pausedUntil > until) {
    return config.pausedUntil;
  }

  await AgentConfig.updateOne(
    { userId },
    { $set: { pausedUntil: until, pauseReason: reason.slice(0, 300) } }
  );
  return until;
}
