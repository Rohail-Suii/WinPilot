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
