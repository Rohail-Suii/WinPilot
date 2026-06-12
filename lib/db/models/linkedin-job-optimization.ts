import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IProfileSnapshot {
  headline: string;
  about: string;
  skills: string[];
  experience: { title: string; company: string; duration: string; description: string }[];
  education: { school: string; degree: string; field: string }[];
  certifications: { name: string; issuingOrg: string }[];
  featured: { type: string; title: string }[];
}

export interface IJobOptimizationAnalysis {
  overallFit: number;
  targetRole: string;
  headline: {
    current: string;
    recommended: string;
    keywords: string[];
    reasoning: string;
  };
  about: {
    current: string;
    recommended: string;
    keyChanges: string[];
  };
  skillsGap: {
    have: string[];
    missing: string[];
    quickWins: string[];
  };
  postIdeas: {
    topic: string;
    angle: string;
    type: string;
    hashtags: string[];
    whyItHelps: string;
  }[];
  certificates: {
    name: string;
    provider: string;
    relevance: string;
    url?: string;
  }[];
  featuredSuggestions: {
    type: string;
    description: string;
    priority: "high" | "medium" | "low";
  }[];
}

export interface ILinkedInJobOptimization extends Document {
  userId: mongoose.Types.ObjectId;
  profileSnapshot: IProfileSnapshot;
  jobDescription: string;
  analysis: IJobOptimizationAnalysis | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSnapshotSchema = new Schema<IProfileSnapshot>(
  {
    headline: { type: String, default: "" },
    about: { type: String, default: "" },
    skills: [String],
    experience: [
      {
        title: { type: String, default: "" },
        company: { type: String, default: "" },
        duration: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    education: [
      {
        school: { type: String, default: "" },
        degree: { type: String, default: "" },
        field: { type: String, default: "" },
      },
    ],
    certifications: [
      {
        name: { type: String, default: "" },
        issuingOrg: { type: String, default: "" },
      },
    ],
    featured: [
      {
        type: { type: String, default: "" },
        title: { type: String, default: "" },
      },
    ],
  },
  { _id: false }
);

const LinkedInJobOptimizationSchema = new Schema<ILinkedInJobOptimization>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    profileSnapshot: { type: ProfileSnapshotSchema, required: true },
    jobDescription: { type: String, required: true, maxlength: 10000 },
    analysis: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

const LinkedInJobOptimization: Model<ILinkedInJobOptimization> =
  mongoose.models.LinkedInJobOptimization ||
  mongoose.model<ILinkedInJobOptimization>(
    "LinkedInJobOptimization",
    LinkedInJobOptimizationSchema
  );

export default LinkedInJobOptimization;
