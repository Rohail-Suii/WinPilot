import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  action: string;
  module: "jobs" | "hero" | "scraper" | "autopilot";
  details: Record<string, unknown>;
  status: "success" | "failure" | "skipped";
  linkedinUrl?: string;
  timestamp: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  module: {
    type: String,
    enum: ["jobs", "hero", "scraper", "autopilot"],
    required: true,
  },
  details: { type: Schema.Types.Mixed, default: {} },
  status: {
    type: String,
    enum: ["success", "failure", "skipped"],
    default: "success",
  },
  linkedinUrl: String,
  timestamp: { type: Date, default: Date.now },
  isGuest: { type: Boolean, default: false, index: true },
});

// Auto-delete logs after 90 days
ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
ActivityLogSchema.index({ userId: 1, module: 1 });
ActivityLogSchema.index({ timestamp: -1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);

export default ActivityLog;
