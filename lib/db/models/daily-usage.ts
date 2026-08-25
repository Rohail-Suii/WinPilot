import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IDailyUsage extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  expiresAt?: Date;
  date: string; // YYYY-MM-DD
  actions: {
    applies: number;
    posts: number;
    scrapes: number;
    profileViews: number;
    messages: number;
    comments: number;
    connectionRequests: number;
    likes: number;
  };
}

const DailyUsageSchema = new Schema<IDailyUsage>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true },
  actions: {
    applies: { type: Number, default: 0 },
    posts: { type: Number, default: 0 },
    scrapes: { type: Number, default: 0 },
    profileViews: { type: Number, default: 0 },
    messages: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    connectionRequests: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
  },
  isGuest: { type: Boolean, default: false, index: true },
  expiresAt: { type: Date },
});

// Auto-delete guest daily usage after expiresAt
DailyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
DailyUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyUsage: Model<IDailyUsage> =
  mongoose.models.DailyUsage ||
  mongoose.model<IDailyUsage>("DailyUsage", DailyUsageSchema);

export default DailyUsage;
