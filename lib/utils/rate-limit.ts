import connectDB from "@/lib/db/connection";
import mongoose from "mongoose";

const RateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, index: true },
  points: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

const RateLimitModel =
  mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);

async function consumePoint(
  keyPrefix: string,
  key: string,
  maxPoints: number,
  durationSec: number
): Promise<{ success: boolean; retryAfter?: number }> {
  try {
    await connectDB();
    const fullKey = `${keyPrefix}:${key}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationSec * 1000);

    const doc = await RateLimitModel.findOneAndUpdate(
      { key: fullKey, expiresAt: { $gt: now } },
      { $inc: { points: 1 } },
      { returnDocument: "after" }
    );

    if (!doc) {
      // No active window — create one
      await RateLimitModel.findOneAndUpdate(
        { key: fullKey },
        { $set: { points: 1, expiresAt } },
        { upsert: true, returnDocument: "after" }
      );
      return { success: true };
    }

    if (doc.points > maxPoints) {
      const retryAfter = Math.ceil((doc.expiresAt.getTime() - now.getTime()) / 1000);
      return { success: false, retryAfter };
    }

    return { success: true };
  } catch (error) {
    // Fail open: allow requests through when rate limiter DB is unreachable
    console.error("[RateLimit] DB error, failing open:", error);
    return { success: true };
  }
}

export async function checkAuthRateLimit(ip: string): Promise<{ success: boolean; retryAfter?: number }> {
  return consumePoint("auth", ip, 5, 60);
}

export async function checkApiRateLimit(userId: string): Promise<{ success: boolean; retryAfter?: number }> {
  return consumePoint("api", userId, 100, 60);
}
