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
  /** One-sentence mission, e.g. "land an international React/Next.js contract" */
  mission: string;
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
    mission: { type: String, default: "", maxlength: 500 },
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
