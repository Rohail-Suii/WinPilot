import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * The prospect pipeline — one document per founder or decision-maker.
 *
 * Stage machine:
 *   discovered → warming → invited → connected → dm_sent → in_conversation → opportunity
 *   with `dormant` (went quiet) and `rejected` (below fit threshold) as exits.
 *
 * The planner reads `{ stage, nextTouchAt }` to decide what to do next, so the
 * pipeline itself drives the schedule rather than a fixed script.
 */

export type TargetStage =
  | "discovered"
  | "warming"
  | "invited"
  | "connected"
  | "engaged"
  | "dm_sent"
  | "in_conversation"
  | "opportunity"
  | "dormant"
  | "rejected";

export type TouchpointKind =
  | "profile_view"
  | "post_like"
  | "post_comment"
  | "follow"
  | "connection_request"
  | "dm"
  | "reply_received";

export interface ITouchpoint {
  kind: TouchpointKind;
  at: Date;
  content?: string;
  taskId?: string;
  url?: string;
}

export interface IAgentTarget extends Document {
  userId: mongoose.Types.ObjectId;
  profileUrl: string;
  name: string;
  headline: string;
  company: string;
  companyUrl?: string;
  companySize?: string;
  location: string;
  fitScore: number; // 0-100
  fitReason: string;
  stage: TargetStage;
  touchpoints: ITouchpoint[];
  /** When the planner is next allowed to act on this person. */
  nextTouchAt?: Date;
  lastPostSeenUrl?: string;
  notes: string;
  discoveredVia: string;
  createdAt: Date;
  updatedAt: Date;
}

const TouchpointSchema = new Schema<ITouchpoint>(
  {
    kind: {
      type: String,
      enum: [
        "profile_view",
        "post_like",
        "post_comment",
        "follow",
        "connection_request",
        "dm",
        "reply_received",
      ],
      required: true,
    },
    at: { type: Date, default: Date.now },
    content: String,
    taskId: String,
    url: String,
  },
  { _id: false }
);

const AgentTargetSchema = new Schema<IAgentTarget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    profileUrl: { type: String, required: true },
    name: { type: String, default: "" },
    headline: { type: String, default: "" },
    company: { type: String, default: "" },
    companyUrl: { type: String },
    companySize: { type: String, default: "" },
    location: { type: String, default: "" },
    fitScore: { type: Number, default: 0, min: 0, max: 100 },
    fitReason: { type: String, default: "" },
    stage: {
      type: String,
      enum: [
        "discovered",
        "warming",
        "invited",
        "connected",
        "engaged",
        "dm_sent",
        "in_conversation",
        "opportunity",
        "dormant",
        "rejected",
      ],
      default: "discovered",
    },
    touchpoints: { type: [TouchpointSchema], default: [] },
    nextTouchAt: { type: Date },
    lastPostSeenUrl: { type: String },
    notes: { type: String, default: "" },
    discoveredVia: { type: String, default: "" },
  },
  { timestamps: true }
);

AgentTargetSchema.index({ userId: 1, profileUrl: 1 }, { unique: true });
AgentTargetSchema.index({ userId: 1, stage: 1, nextTouchAt: 1 });
AgentTargetSchema.index({ userId: 1, fitScore: -1 });

/** Stages that count as an active pipeline, for funnel and planning maths. */
export const ACTIVE_STAGES: TargetStage[] = [
  "discovered",
  "warming",
  "invited",
  "connected",
  "engaged",
  "dm_sent",
  "in_conversation",
];

const AgentTarget: Model<IAgentTarget> =
  mongoose.models.AgentTarget ||
  mongoose.model<IAgentTarget>("AgentTarget", AgentTargetSchema);

export default AgentTarget;
