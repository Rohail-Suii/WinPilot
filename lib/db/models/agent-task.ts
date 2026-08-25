import mongoose, { Schema, type Document, type Model } from "mongoose";
import { TASK_KINDS, type TaskKind } from "./agent-config";

/**
 * The work queue. One document per atomic LinkedIn action.
 *
 * `dedupeKey` carries the whole duplicate-prevention story: it is uniquely
 * indexed per user, so the same post can never be commented on twice and the
 * same person can never be invited twice, no matter how many ticks run or how
 * often the server restarts.
 */

export type TaskState =
  | "queued"
  | "dispatched"
  | "running"
  | "done"
  | "failed"
  | "skipped"
  | "awaiting_review";

export interface IAgentTask extends Document {
  userId: mongoose.Types.ObjectId;
  cycleId?: mongoose.Types.ObjectId;
  kind: TaskKind;
  payload: Record<string, unknown>;
  state: TaskState;
  scheduledFor: Date;
  /** Higher runs first. */
  priority: number;
  attempts: number;
  maxAttempts: number;
  /** Unique per user. Omit only for tasks that are genuinely repeatable. */
  dedupeKey?: string;
  /** Why the planner chose this task — surfaced in the journal. */
  rationale: string;
  result?: Record<string, unknown>;
  error?: string;
  dispatchedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentTaskSchema = new Schema<IAgentTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    cycleId: { type: Schema.Types.ObjectId, ref: "AgentCycle" },
    kind: { type: String, enum: TASK_KINDS as unknown as string[], required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    state: {
      type: String,
      enum: [
        "queued",
        "dispatched",
        "running",
        "done",
        "failed",
        "skipped",
        "awaiting_review",
      ],
      default: "queued",
    },
    scheduledFor: { type: Date, default: Date.now },
    priority: { type: Number, default: 50 },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    dedupeKey: { type: String },
    rationale: { type: String, default: "", maxlength: 1000 },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    dispatchedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

AgentTaskSchema.index({ userId: 1, state: 1, scheduledFor: 1 });
AgentTaskSchema.index({ userId: 1, state: 1, priority: -1 });
/**
 * "Unique when a dedupeKey is actually set."
 *
 * This MUST be a partial index, not a sparse one. On a COMPOUND index, `sparse`
 * only skips documents missing *every* indexed field — and `userId` is always
 * present, so a sparse version indexes every task with `dedupeKey: null` and
 * lets a user hold exactly ONE key-less task ever. Repeatable kinds like
 * `comment_on_feed` carry no dedupeKey by design (the post is only known at
 * runtime), so that mistake deadlocks the queue permanently after the first one.
 */
AgentTaskSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);
AgentTaskSchema.index({ userId: 1, cycleId: 1 });

/** States a task can still move out of. Anything else is terminal. */
export const ACTIVE_TASK_STATES: TaskState[] = ["queued", "dispatched", "running"];

const AgentTask: Model<IAgentTask> =
  mongoose.models.AgentTask || mongoose.model<IAgentTask>("AgentTask", AgentTaskSchema);

export default AgentTask;
