import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * One 7-day plan. The agent writes it, runs against it, then scores itself and
 * writes the next one — with `strategyDelta` recording what it changed and why.
 *
 * Exactly one cycle per user is ever in status "running".
 */

export type CycleStatus = "planning" | "running" | "reviewing" | "closed";

/** Effort split across the four surfaces. Values are percentages summing to 100. */
export interface IChannelMix {
  prospecting: number;
  content: number;
  engagement: number;
  inbox: number;
}

export interface ICycleTarget {
  metric: string;
  planned: number;
}

export interface ICycleActual {
  metric: string;
  achieved: number;
}

export interface IAgentCycle extends Document {
  userId: mongoose.Types.ObjectId;
  weekNumber: number;
  startsAt: Date;
  endsAt: Date;
  /** AI prose: what it will try this week and why */
  strategy: string;
  channelMix: IChannelMix;
  targets: ICycleTarget[];
  actuals: ICycleActual[];
  status: CycleStatus;
  reviewSummary?: string;
  /** What changed vs last week, and why. Empty on week 1. */
  strategyDelta?: string;
  /** Self-assessment 0-100, written by the reviewer */
  score?: number;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_CHANNEL_MIX: IChannelMix = {
  prospecting: 40,
  content: 20,
  engagement: 30,
  inbox: 10,
};

const AgentCycleSchema = new Schema<IAgentCycle>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    weekNumber: { type: Number, required: true, min: 1 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    strategy: { type: String, default: "" },
    channelMix: {
      prospecting: { type: Number, default: DEFAULT_CHANNEL_MIX.prospecting },
      content: { type: Number, default: DEFAULT_CHANNEL_MIX.content },
      engagement: { type: Number, default: DEFAULT_CHANNEL_MIX.engagement },
      inbox: { type: Number, default: DEFAULT_CHANNEL_MIX.inbox },
    },
    targets: [
      {
        _id: false,
        metric: { type: String, required: true },
        planned: { type: Number, default: 0 },
      },
    ],
    actuals: [
      {
        _id: false,
        metric: { type: String, required: true },
        achieved: { type: Number, default: 0 },
      },
    ],
    status: {
      type: String,
      enum: ["planning", "running", "reviewing", "closed"],
      default: "planning",
    },
    reviewSummary: { type: String, default: "" },
    strategyDelta: { type: String, default: "" },
    score: { type: Number, min: 0, max: 100 },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

AgentCycleSchema.index({ userId: 1, status: 1 });
AgentCycleSchema.index({ userId: 1, weekNumber: -1 });

const AgentCycle: Model<IAgentCycle> =
  mongoose.models.AgentCycle ||
  mongoose.model<IAgentCycle>("AgentCycle", AgentCycleSchema);

export default AgentCycle;
