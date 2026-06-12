import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IGuestSession extends Document {
  uuid: string;
  expiresAt: Date;
  createdAt: Date;
}

const GuestSessionSchema = new Schema<IGuestSession>({
  uuid: { type: String, required: true, unique: true, index: true },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
  },
  createdAt: { type: Date, default: Date.now },
});

// Auto-delete guest sessions after expiresAt via MongoDB TTL
GuestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const GuestSession: Model<IGuestSession> =
  mongoose.models.GuestSession ||
  mongoose.model<IGuestSession>("GuestSession", GuestSessionSchema);

export default GuestSession;
