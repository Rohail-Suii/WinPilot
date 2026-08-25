import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * The agent's ultimate goal, decomposed by AI from AgentConfig.mission.
 *
 * `personaSnapshot` is the single most important field for output quality:
 * every generated comment, DM, and post is grounded in it, which is what
 * separates specific writing from generic AI slop.
 */

export interface ISuccessMetric {
  /** Machine-readable metric name, e.g. "dm_replies_from_founders" */
  kind: string;
  target: number;
  by?: Date;
}

export interface ISubGoal {
  text: string;
  metric: string;
  target: number;
  status: "open" | "hit" | "dropped";
}

export interface IGoalConstraints {
  niche: string[];
  targetRoles: string[];
  targetCompanySizeMin: number;
  targetCompanySizeMax: number;
  geographies: string[];
  excludes: string[];
}

export interface IPersonaSnapshot {
  headline: string;
  summary: string;
  topSkills: string[];
  /** Real projects/experiences the AI is allowed to draw on. Never invent beyond these. */
  signatureProjects: { name: string; whatIDid: string; tech: string[] }[];
  /** Free-text notes on how this person actually writes */
  voiceNotes: string;
  yearsExperience: number;
  location: string;
}

export interface IAgentGoal extends Document {
  userId: mongoose.Types.ObjectId;
  northStar: string;
  successMetric: ISuccessMetric;
  subGoals: ISubGoal[];
  constraints: IGoalConstraints;
  personaSnapshot: IPersonaSnapshot;
  revisedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentGoalSchema = new Schema<IAgentGoal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    northStar: { type: String, required: true, maxlength: 500 },
    successMetric: {
      kind: { type: String, default: "dm_conversations_started" },
      target: { type: Number, default: 10 },
      by: { type: Date },
    },
    subGoals: [
      {
        _id: false,
        text: { type: String, default: "" },
        metric: { type: String, default: "" },
        target: { type: Number, default: 0 },
        status: { type: String, enum: ["open", "hit", "dropped"], default: "open" },
      },
    ],
    constraints: {
      niche: { type: [String], default: [] },
      targetRoles: { type: [String], default: [] },
      targetCompanySizeMin: { type: Number, default: 5 },
      targetCompanySizeMax: { type: Number, default: 100 },
      geographies: { type: [String], default: [] },
      excludes: { type: [String], default: [] },
    },
    personaSnapshot: {
      headline: { type: String, default: "" },
      summary: { type: String, default: "" },
      topSkills: { type: [String], default: [] },
      signatureProjects: [
        {
          _id: false,
          name: { type: String, default: "" },
          whatIDid: { type: String, default: "" },
          tech: { type: [String], default: [] },
        },
      ],
      voiceNotes: { type: String, default: "" },
      yearsExperience: { type: Number, default: 0 },
      location: { type: String, default: "" },
    },
    revisedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const AgentGoal: Model<IAgentGoal> =
  mongoose.models.AgentGoal || mongoose.model<IAgentGoal>("AgentGoal", AgentGoalSchema);

export default AgentGoal;
