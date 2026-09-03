import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Per-user Autopilot switch and safety envelope.
 *
 * One document per user. The scheduler in lib/autopilot/scheduler.ts queries
 * `{ enabled: true }` on every tick, so this collection is the master on/off
 * control for the whole autonomous system.
 */

/** Every autonomous action the agent can take. Mirrors AgentTask.kind. */
export const TASK_KINDS = [
  // Core
  "plan_cycle",
  "review_cycle",
  // Prospecting (M1)
  "discover_targets",
  "score_targets",
  "view_target_profile",
  "send_connection",
  "check_invite_accepted",
  "follow_target",
  // Engagement (M2)
  "engage_target_post",
  "comment_on_feed",
  "like_post",
  "scan_notifications",
  "warm_dormant_targets",
  // Inbox (M3)
  "scan_inbox",
  "classify_thread",
  "reply_thread",
  "send_dm",
  "followup_target",
  // Content (M4)
  "research_topics",
  "draft_post",
  "publish_post",
  "measure_post",
  // Profile (M5)
  "audit_own_profile",
  "apply_profile_edit",
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

/**
 * Task kinds Phase 0 can actually execute. The planner refuses to queue
 * anything outside this set, so later phases light up by extending it rather
 * than by touching planner logic.
 */
export const IMPLEMENTED_TASK_KINDS: TaskKind[] = [
  "comment_on_feed",
  "like_post",
  "view_target_profile",
];

export type AutonomyMode = "auto" | "review";

/**
 * Which brain drives the agent.
 *
 * "feed"       — the simple one. Work down the LinkedIn home feed and engage
 *                every post on it: read it, like it, leave a comment worth
 *                reading, move to the next one. No picking, no mission,
 *                no goal decomposition, no weekly cycles. This is the default
 *                because it is the mode that produces visible activity on day
 *                one without any setup beyond a career profile.
 * "strategist" — the full autonomous stack: mission -> goal -> weekly cycle ->
 *                planned channel mix -> review. More powerful, far more moving
 *                parts, and useless until a mission is set.
 */
export type AutopilotMode = "feed" | "strategist";

export interface IFeedSettings {
  /**
   * Share of engaged posts that get a written comment; the rest are liked and
   * left. 1 means comment on everything the agent decides to engage with.
   */
  commentRatio: number;
  /** On a hiring post, comment with a real pitch backed by real projects. */
  pitchOnJobPosts: boolean;
  /**
   * How far down the feed one trip goes before reloading and starting again
   * from the top.
   *
   * The pass reads and acts on each post as it reaches it, so this is a depth,
   * not a batch size. Going back to the top periodically is what keeps an
   * uncapped pass finding new posts instead of scrolling into the archive.
   */
  postsPerSweep: number;
  /**
   * How many of those posts one pass may actually engage with.
   *
   * The pass engages every unseen post it finds, in feed order, until it hits
   * this — there is no picking and no passing over. The real ceiling is still
   * the day's action budget; this only decides how much of it one trip down
   * the feed is allowed to spend in a sitting.
   */
  postsPerPass: number;
  /**
   * Take the brakes off: like and comment on every post the feed shows,
   * ignoring the daily budget and the per-action cooldown, and keep working
   * down the feed — reloading it when it runs dry — until the agent is turned
   * off. `postsPerPass` is ignored while this is on.
   *
   * This is a deliberate choice with a real cost: budgets and cooldowns are
   * what keep the account's action volume inside what LinkedIn tolerates, and
   * without them the account can be restricted. Working hours and the
   * pushback circuit breaker still apply.
   */
  unlimited: boolean;
  /**
   * Write feed comments with the cheapest model the provider offers.
   *
   * A feed comment is a short writing task with the whole voice spec already
   * in the prompt, so the frontier models buy very little here and cost
   * several times as much per post. On by default: an uncapped feed pass makes
   * one call per post all day, and that is where the money goes.
   */
  economyMode: boolean;
  /**
   * Most AI calls autopilot may make in a day. 0 means uncapped.
   *
   * Counted rather than priced because only some providers report token usage,
   * and a limit that silently never fires is worse than none. When it is
   * reached the agent keeps liking posts and stops commenting until tomorrow.
   */
  dailyAiCalls: number;
  /** Hard dollar ceiling per day, for providers that report cost. 0 is off. */
  dailyAiSpendUsd: number;
  /**
   * Match the post's mood instead of writing every comment the same way.
   *
   * On, the agent picks a register — analytical, playful, celebratory or
   * supportive — answers a joke lightly and a setback plainly, varies the
   * length from a few words to a short paragraph, and steers away from the
   * openings it used recently.
   *
   * Off restores the single-register behaviour exactly: one analytical voice,
   * one length, no emoji, and one fewer database read per post. It is the
   * rollback path for a change that touches how the account sounds in public.
   */
  commentVariety: boolean;
  /**
   * Allow at most one emoji, and only where the register calls for one.
   *
   * Never on a technical post and never on a hiring pitch, whatever this is
   * set to. Separate from `commentVariety` because emoji are a taste call some
   * accounts will want off while still wanting varied length and register.
   */
  allowEmoji: boolean;
}

export const DEFAULT_FEED_SETTINGS: IFeedSettings = {
  commentRatio: 0.7,
  pitchOnJobPosts: true,
  postsPerSweep: 25,
  postsPerPass: 5,
  // On by default: feed mode exists to work the whole feed, and a capped pass
  // that stops after five posts is not that. Turned off in the UI when the
  // daily budgets should apply again.
  unlimited: true,
  economyMode: true,
  dailyAiCalls: 150,
  dailyAiSpendUsd: 0,
  commentVariety: true,
  allowEmoji: true,
};

export interface IWeeklyBudgets {
  connects: number;
  comments: number;
  dms: number;
  posts: number;
  likes: number;
  profileViews: number;
}

export interface IAgentConfig extends Document {
  userId: mongoose.Types.ObjectId;
  enabled: boolean;
  /** Which brain drives the agent. See AutopilotMode. */
  mode: AutopilotMode;
  /** One-sentence mission, e.g. "land an international React/Next.js contract" */
  mission: string;
  /** Tuning for "feed" mode. Ignored entirely in "strategist" mode. */
  feed: IFeedSettings;
  workingHours: {
    start: number; // 0-23, local to `timezone`
    end: number; // 0-23, exclusive
    timezone: string; // IANA, e.g. "Asia/Karachi"
    activeDays: number[]; // 0=Sun .. 6=Sat
  };
  /** Hard ceilings the governor enforces. Weekly, not daily — the planner spreads them. */
  weeklyBudgets: IWeeklyBudgets;
  /**
   * Per-task-kind gate. Defaults to "auto" for every kind (fully autonomous).
   * Flipping one to "review" parks its tasks in `awaiting_review` instead of
   * dispatching them — a config change, not a rebuild.
   */
  autonomy: Map<string, AutonomyMode>;
  /**
   * Ramp-up: week 1 runs at 40% of budget, scaling to 100% over three weeks.
   * New automation patterns on an established account are the classic trigger.
   */
  rampStartedAt?: Date;
  pausedUntil?: Date;
  pauseReason?: string;
  lastTickAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_WEEKLY_BUDGETS: IWeeklyBudgets = {
  connects: 75, // ~15/day over 5 active days
  comments: 100, // ~20/day
  dms: 60, // ~12/day — deliberately below the 25/day ceiling
  posts: 3,
  likes: 150,
  profileViews: 300,
};

const AgentConfigSchema = new Schema<IAgentConfig>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    enabled: { type: Boolean, default: false },
    mode: { type: String, enum: ["feed", "strategist"], default: "feed" },
    mission: { type: String, default: "", maxlength: 500 },
    feed: {
      commentRatio: { type: Number, default: DEFAULT_FEED_SETTINGS.commentRatio, min: 0, max: 1 },
      pitchOnJobPosts: { type: Boolean, default: DEFAULT_FEED_SETTINGS.pitchOnJobPosts },
      postsPerSweep: { type: Number, default: DEFAULT_FEED_SETTINGS.postsPerSweep, min: 5, max: 60 },
      postsPerPass: { type: Number, default: DEFAULT_FEED_SETTINGS.postsPerPass, min: 1, max: 25 },
      unlimited: { type: Boolean, default: DEFAULT_FEED_SETTINGS.unlimited },
      economyMode: { type: Boolean, default: DEFAULT_FEED_SETTINGS.economyMode },
      dailyAiCalls: { type: Number, default: DEFAULT_FEED_SETTINGS.dailyAiCalls, min: 0, max: 5000 },
      dailyAiSpendUsd: { type: Number, default: DEFAULT_FEED_SETTINGS.dailyAiSpendUsd, min: 0, max: 1000 },
      commentVariety: { type: Boolean, default: DEFAULT_FEED_SETTINGS.commentVariety },
      allowEmoji: { type: Boolean, default: DEFAULT_FEED_SETTINGS.allowEmoji },
    },
    workingHours: {
      start: { type: Number, default: 9, min: 0, max: 23 },
      end: { type: Number, default: 21, min: 1, max: 24 },
      timezone: { type: String, default: "Asia/Karachi" },
      activeDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    },
    weeklyBudgets: {
      connects: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.connects, min: 0 },
      comments: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.comments, min: 0 },
      dms: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.dms, min: 0 },
      posts: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.posts, min: 0 },
      likes: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.likes, min: 0 },
      profileViews: { type: Number, default: DEFAULT_WEEKLY_BUDGETS.profileViews, min: 0 },
    },
    autonomy: {
      type: Map,
      of: { type: String, enum: ["auto", "review"] },
      default: () => new Map<string, AutonomyMode>(),
    },
    rampStartedAt: { type: Date },
    pausedUntil: { type: Date },
    pauseReason: { type: String, default: "" },
    lastTickAt: { type: Date },
  },
  { timestamps: true }
);

AgentConfigSchema.index({ enabled: 1 });

/** Unset kinds are autonomous — absence means "auto", never "blocked". */
export function autonomyFor(config: IAgentConfig, kind: TaskKind): AutonomyMode {
  return config.autonomy?.get(kind) ?? "auto";
}

const AgentConfig: Model<IAgentConfig> =
  mongoose.models.AgentConfig ||
  mongoose.model<IAgentConfig>("AgentConfig", AgentConfigSchema);

export default AgentConfig;
