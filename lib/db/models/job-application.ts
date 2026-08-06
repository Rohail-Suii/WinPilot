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

export interface IJobApplication extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  expiresAt?: Date;
  jobSearchId?: mongoose.Types.ObjectId;
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
