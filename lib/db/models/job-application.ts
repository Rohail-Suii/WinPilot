import mongoose, { Schema, type Document, type Model } from "mongoose";

export type ApplicationStatus =
  | "found"
  | "tailoring"
  | "applying"
  | "applied"
  | "failed"
  | "skipped"
  | "interview"
  | "rejected"
  | "offered";

export interface IMatchBreakdown {
  skillsMatch?: number;
  experienceMatch?: number;
  educationMatch?: number;
  matchingSkills?: string[];
  missingSkills?: string[];
  strengths?: string[];
  concerns?: string[];
  recommendation?: string;
}

export type JobApplicationPlatform = "linkedin" | "indeed";

export interface IJobApplication extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  expiresAt?: Date;
  jobSearchId?: mongoose.Types.ObjectId;
  platform: JobApplicationPlatform;
  jobTitle: string;
  company: string;
  location?: string;
  jobUrl: string;
  jobDescription: string;
  status: ApplicationStatus;
  tailoredResume?: {
    summary?: string;
    skills?: string[];
    highlights?: string[];
    matchExplanation?: string;
    keywordsUsed?: string[];
    detectedRole?: string;
    source?: "resume" | "data";
    experience?: {
      company?: string;
      title?: string;
      description?: string;
      highlights?: string[];
    }[];
    projects?: {
      name?: string;
      description?: string;
      tech?: string[];
    }[];
  };
  matchBreakdown?: IMatchBreakdown;
  /**
   * Follow-up messages sent on LinkedIn after applying (Auto Messaging). One
   * entry per channel attempted — "message page" and "message employee" are
   * independent toggles, so both can fire for the same application.
   */
  outreach?: {
    sent: boolean;
    channel: "hiring_team" | "company_page" | "connection";
    recipient?: string;
    message?: string;
    /** Why nothing was sent — e.g. the company page has messaging turned off. */
    reason?: string;
    at: Date;
  }[];
  formAnswers: {
    question: string;
    answer: string;
    fieldType: string;
  }[];
  appliedAt?: Date;
  notes?: string;
  matchScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const JobApplicationSchema = new Schema<IJobApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    jobSearchId: { type: Schema.Types.ObjectId, ref: "JobSearch" },
    platform: { type: String, enum: ["linkedin", "indeed"], default: "linkedin" },
    jobTitle: { type: String, required: true },
    company: { type: String, required: true },
    location: String,
    jobUrl: { type: String, required: true },
    jobDescription: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "found",
        "tailoring",
        "applying",
        "applied",
        "failed",
        "skipped",
        "interview",
        "rejected",
        "offered",
      ],
      default: "found",
    },
    tailoredResume: {
      summary: String,
      skills: [String],
      highlights: [String],
      matchExplanation: String,
      keywordsUsed: [String],
      detectedRole: String,
      source: { type: String, enum: ["resume", "data"] },
      experience: [
        {
          company: String,
          title: String,
          description: String,
          highlights: [String],
        },
      ],
      projects: [
        {
          name: String,
          description: String,
          tech: [String],
        },
      ],
    },
    matchBreakdown: {
      skillsMatch: Number,
      experienceMatch: Number,
      educationMatch: Number,
      matchingSkills: [String],
      missingSkills: [String],
      strengths: [String],
      concerns: [String],
      recommendation: String,
    },
    outreach: [
      {
        sent: { type: Boolean, default: false },
        channel: { type: String, enum: ["hiring_team", "company_page", "connection"], required: true },
        recipient: String,
        message: String,
        reason: String,
        at: { type: Date, default: Date.now },
      },
    ],
    formAnswers: [
      {
        question: String,
        answer: String,
        fieldType: String,
      },
    ],
    appliedAt: Date,
    notes: String,
    matchScore: Number,
    isGuest: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// Auto-delete guest job applications after expiresAt
JobApplicationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
JobApplicationSchema.index({ userId: 1, status: 1 });
JobApplicationSchema.index({ appliedAt: -1 });
JobApplicationSchema.index({ company: 1 });
JobApplicationSchema.index({ userId: 1, jobUrl: 1 }, { unique: true });
JobApplicationSchema.index({ jobTitle: "text", company: "text" });

const JobApplication: Model<IJobApplication> =
  mongoose.models.JobApplication ||
  mongoose.model<IJobApplication>("JobApplication", JobApplicationSchema);

export default JobApplication;
