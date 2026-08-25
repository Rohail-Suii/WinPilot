import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Durable learnings — what makes week 6 smarter than week 1.
 *
 * The reviewer distils these at the end of each cycle; `recall()` injects the
 * highest-confidence ones into every planning and generation prompt. Confidence
 * is reinforced when a later week's data confirms a statement and decayed when
 * it is contradicted, so stale tactics fade out on their own.
 */

export type MemoryKind = "insight" | "pattern" | "failure" | "preference" | "fact";

export interface IMemoryEvidence {
  type: "task" | "journal" | "post" | "target" | "thread" | "cycle";
  refId: string;
}

export interface IAgentMemory extends Document {
  userId: mongoose.Types.ObjectId;
  kind: MemoryKind;
  /** One self-contained sentence the AI can act on without extra context. */
  statement: string;
  evidence: IMemoryEvidence[];
  confidence: number; // 0..1
  hitCount: number;
  lastConfirmedAt: Date;
  /** Set for time-bound observations; TTL index removes them automatically. */
  expiresAt?: Date;
  sourceCycleId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMemorySchema = new Schema<IAgentMemory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: {
      type: String,
      enum: ["insight", "pattern", "failure", "preference", "fact"],
      required: true,
    },
    statement: { type: String, required: true, maxlength: 500 },
    evidence: [
      {
        _id: false,
        type: {
          type: String,
          enum: ["task", "journal", "post", "target", "thread", "cycle"],
        },
        refId: String,
      },
    ],
    confidence: { type: Number, default: 0.5, min: 0, max: 1 },
    hitCount: { type: Number, default: 1 },
    lastConfirmedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    sourceCycleId: { type: Schema.Types.ObjectId, ref: "AgentCycle" },
  },
  { timestamps: true }
);

AgentMemorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
AgentMemorySchema.index({ userId: 1, confidence: -1 });
AgentMemorySchema.index({ userId: 1, kind: 1 });

const AgentMemory: Model<IAgentMemory> =
  mongoose.models.AgentMemory ||
  mongoose.model<IAgentMemory>("AgentMemory", AgentMemorySchema);

export default AgentMemory;
