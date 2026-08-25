import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Inbox state, one document per LinkedIn conversation.
 *
 * `messageHash` is what stops the agent answering the same message twice: the
 * inbox scanner hashes the latest incoming message and only queues a reply when
 * the hash has changed since the last scan.
 */

export type ThreadIntent =
  | "recruiter"
  | "client"
  | "sales_spam"
  | "networking"
  | "unknown";

export type ThreadUrgency = "low" | "normal" | "high";

export interface IAgentThread extends Document {
  userId: mongoose.Types.ObjectId;
  conversationUrl: string;
  participantName: string;
  participantUrl: string;
  participantHeadline: string;
  lastMessageAt: Date;
  lastMessageFrom: "them" | "me";
  lastMessageText: string;
  /** Hash of the latest incoming message — dedupe key for replies. */
  messageHash: string;
  intent: ThreadIntent;
  intentConfidence: number; // 0..1
  urgency: ThreadUrgency;
  needsReply: boolean;
  repliedAt?: Date;
  /** True when the agent handed off to the human instead of answering. */
  escalated: boolean;
  escalationReason?: string;
  linkedTargetId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AgentThreadSchema = new Schema<IAgentThread>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationUrl: { type: String, required: true },
    participantName: { type: String, default: "" },
    participantUrl: { type: String, default: "" },
    participantHeadline: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageFrom: { type: String, enum: ["them", "me"], default: "them" },
    lastMessageText: { type: String, default: "", maxlength: 4000 },
    messageHash: { type: String, default: "" },
    intent: {
      type: String,
      enum: ["recruiter", "client", "sales_spam", "networking", "unknown"],
      default: "unknown",
    },
    intentConfidence: { type: Number, default: 0, min: 0, max: 1 },
    urgency: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    needsReply: { type: Boolean, default: false },
    repliedAt: { type: Date },
    escalated: { type: Boolean, default: false },
    escalationReason: { type: String },
    linkedTargetId: { type: Schema.Types.ObjectId, ref: "AgentTarget" },
  },
  { timestamps: true }
);

AgentThreadSchema.index({ userId: 1, conversationUrl: 1 }, { unique: true });
AgentThreadSchema.index({ userId: 1, needsReply: 1, lastMessageAt: -1 });
AgentThreadSchema.index({ userId: 1, intent: 1 });

const AgentThread: Model<IAgentThread> =
  mongoose.models.AgentThread ||
  mongoose.model<IAgentThread>("AgentThread", AgentThreadSchema);

export default AgentThread;
