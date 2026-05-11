import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IAIUsageLog extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  provider: string;
  modelId: string;
  endpoint: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: Date;
  updatedAt: Date;
}

const AIUsageLogSchema = new Schema<IAIUsageLog>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    isGuest: { type: Boolean, default: false, index: true },
    provider: { type: String, required: true, index: true },
    modelId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AIUsageLogSchema.index({ userId: 1, isGuest: 1, createdAt: -1 });
AIUsageLogSchema.index({ userId: 1, isGuest: 1, modelId: 1, createdAt: -1 });

const AIUsageLog: Model<IAIUsageLog> =
  mongoose.models.AIUsageLog ||
  mongoose.model<IAIUsageLog>("AIUsageLog", AIUsageLogSchema);

export default AIUsageLog;
