import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * Standalone career bank used when AI resume source = "data".
 * Separate from uploaded resume documents (Resume collection).
 */
export interface ICareerProfile extends Document {
  userId: mongoose.Types.ObjectId;
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
    startDate?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

const CareerProfileSchema = new Schema<ICareerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
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
        company: { type: String, default: "" },
        title: { type: String, default: "" },
        startDate: { type: String, default: "" },
        endDate: String,
        current: { type: Boolean, default: false },
        description: { type: String, default: "" },
        highlights: [String],
      },
    ],
    education: [
      {
        school: { type: String, default: "" },
        degree: { type: String, default: "" },
        field: { type: String, default: "" },
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
  },
  { timestamps: true }
);

const CareerProfile: Model<ICareerProfile> =
  mongoose.models.CareerProfile ||
  mongoose.model<ICareerProfile>("CareerProfile", CareerProfileSchema);

export default CareerProfile;
