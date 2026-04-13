import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IResume extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  isDefault: boolean;
  contactInfo: {
    name?: string;
    phone?: string;
    email?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary: string;
  experience: {
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    current: boolean;
    description: string;
    highlights: string[];
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string;
    gpa?: string;
  }[];
  skills: string[];
  certifications: {
    name: string;
    issuer: string;
    date?: string;
  }[];
  projects: {
    name: string;
    description: string;
    url?: string;
    tech: string[];
  }[];
  rawText: string;
  customTailoringPrompt?: string;
  pdfUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ResumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    contactInfo: {
      name: String,
      phone: String,
      email: String,
      location: String,
      linkedin: String,
      github: String,
      portfolio: String,
    },
    summary: { type: String, default: "" },
    experience: [
      {
        company: { type: String, required: true },
        title: { type: String, required: true },
        startDate: String,
        endDate: String,
        current: { type: Boolean, default: false },
        description: { type: String, default: "" },
        highlights: [String],
      },
    ],
    education: [
      {
        school: { type: String, required: true },
        degree: String,
        field: String,
        startDate: String,
        endDate: String,
        gpa: String,
      },
    ],
    skills: [String],
    certifications: [{ name: String, issuer: String, date: String }],
    projects: [
      {
        name: String,
        description: String,
        url: String,
        tech: [String],
      },
    ],
    rawText: { type: String, default: "" },
    customTailoringPrompt: { type: String, default: "" },
    pdfUrl: String,
  },
  { timestamps: true }
);

ResumeSchema.index({ userId: 1 });
ResumeSchema.index({ userId: 1, isDefault: 1 });

const Resume: Model<IResume> =
  mongoose.models.Resume || mongoose.model<IResume>("Resume", ResumeSchema);

export default Resume;
