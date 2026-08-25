import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * The living document.
 *
 * Append-only, first-person narrative of what the agent did and why. This is
 * what the user reads at /dashboard/autopilot, and what the planner re-reads on
 * restart to pick up mid-cycle. Entries are never edited, only added.
 */

export type JournalEntryType =
  | "decision"
  | "action"
  | "observation"
  | "error"
  | "reflection";

export interface IJournalRefs {
  taskId?: string;
  targetId?: string;
  postId?: string;
  threadId?: string;
  cycleId?: string;
}

export interface IAgentJournal extends Document {
  userId: mongoose.Types.ObjectId;
  cycleId?: mongoose.Types.ObjectId;
  entryType: JournalEntryType;
  /** "planning" | "prospecting" | "engagement" | "inbox" | "content" | "safety" | ... */
  phase: string;
  /** Plain language, first person. Written to be read by a human, not parsed. */
  text: string;
  refs: IJournalRefs;
  createdAt: Date;
}

const AgentJournalSchema = new Schema<IAgentJournal>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  cycleId: { type: Schema.Types.ObjectId, ref: "AgentCycle" },
  entryType: {
    type: String,
    enum: ["decision", "action", "observation", "error", "reflection"],
    required: true,
  },
  phase: { type: String, default: "general" },
  text: { type: String, required: true, maxlength: 4000 },
  refs: {
    taskId: String,
    targetId: String,
    postId: String,
    threadId: String,
    cycleId: String,
  },
  createdAt: { type: Date, default: Date.now },
});

// Auto-delete journal entries after 180 days
AgentJournalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
AgentJournalSchema.index({ userId: 1, createdAt: -1 });
AgentJournalSchema.index({ userId: 1, cycleId: 1 });

const AgentJournal: Model<IAgentJournal> =
  mongoose.models.AgentJournal ||
  mongoose.model<IAgentJournal>("AgentJournal", AgentJournalSchema);

export default AgentJournal;
