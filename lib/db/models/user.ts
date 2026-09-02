import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  image?: string;
  hashedPassword?: string;
  emailVerified?: Date;
  linkedinProfile?: {
    name?: string;
    headline?: string;
    url?: string;
    profilePicUrl?: string;
  };
  aiApiKeys: {
    provider: "gemini" | "openai" | "anthropic" | "groq" | "openrouter";
    encryptedKey: string;
    isValid: boolean;
  }[];
  preferredAIProvider?: string;
  preferredOpenRouterModel?: string;
  /**
   * Gmail credentials and pacing for the job-application sender.
   *
   * The app password is stored encrypted with the same envelope as the AI keys.
   * It is never returned to the client — the settings API reports only whether
   * one is set and which account it belongs to.
   */
  emailOutreach?: {
    enabled: boolean;
    gmailUser?: string;
    encryptedAppPassword?: string;
    fromName?: string;
    /** Appended verbatim below the AI-written body. */
    signature?: string;
    /** Hard ceiling on sends per day. Gmail's own limit is 500. */
    dailyLimit: number;
    /** Minimum minutes between two sends — bursts look like a mail merge. */
    minGapMinutes: number;
    /** Blind-copy the user so they have the thread in their own Sent mail. */
    ccSelf: boolean;
    /** Below this detection confidence the post waits for a human. */
    minConfidence: number;
    /**
     * Require the post to name a tool the user has actually used, not just to
     * be in their line of work. Off by default: a WordPress role is a real
     * opening for a JavaScript web developer, and it names none of their tools.
     */
    strictSkillMatch: boolean;
    /** Last successful SMTP handshake, from the Test connection button. */
    verifiedAt?: Date;
  };
  settings: {
    timezone: string;
    language: string;
    notificationPrefs: {
      email: boolean;
      inApp: boolean;
      extension: boolean;
    };
    dailyLimits: {
      applies: number;
      posts: number;
      scrapes: number;
    };
    /** How AI builds per-job resumes during automation: uploaded resume doc vs full career data */
    resumeTailoringSource?: "resume" | "data";
  };
  subscription: {
    plan: string;
    startDate: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    hashedPassword: { type: String, select: false },
    emailVerified: { type: Date },
    linkedinProfile: {
      name: String,
      headline: String,
      url: String,
      profilePicUrl: String,
    },
    aiApiKeys: [
      {
        provider: {
          type: String,
          enum: ["gemini", "openai", "anthropic", "groq", "openrouter"],
          required: true,
        },
        encryptedKey: { type: String, required: true },
        isValid: { type: Boolean, default: true },
      },
    ],
    preferredAIProvider: { type: String, default: "" },
    preferredOpenRouterModel: {
      type: String,
      default: "meta-llama/llama-3.3-70b-instruct:free",
    },
    emailOutreach: {
      enabled: { type: Boolean, default: false },
      gmailUser: { type: String, default: "" },
      encryptedAppPassword: { type: String, default: "", select: false },
      fromName: { type: String, default: "" },
      signature: { type: String, default: "", maxlength: 600 },
      dailyLimit: { type: Number, default: 20, min: 1, max: 400 },
      minGapMinutes: { type: Number, default: 6, min: 1, max: 240 },
      ccSelf: { type: Boolean, default: true },
      minConfidence: { type: Number, default: 0.6, min: 0, max: 1 },
      strictSkillMatch: { type: Boolean, default: false },
      verifiedAt: { type: Date },
    },
    settings: {
      timezone: { type: String, default: "UTC" },
      language: { type: String, default: "en" },
      notificationPrefs: {
        email: { type: Boolean, default: true },
        inApp: { type: Boolean, default: true },
        extension: { type: Boolean, default: true },
      },
      dailyLimits: {
        applies: { type: Number, default: 15 },
        posts: { type: Number, default: 2 },
        scrapes: { type: Number, default: 50 },
      },
      resumeTailoringSource: {
        type: String,
        enum: ["resume", "data"],
        default: "resume",
      },
    },
    subscription: {
      plan: { type: String, default: "free" },
      startDate: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

UserSchema.index({ createdAt: 1 });

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
