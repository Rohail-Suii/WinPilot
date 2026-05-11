import connectDB from "@/lib/db/connection";
import mongoose from "mongoose";

/**
 * Migrates all guest data to an authenticated user account.
 * Called after a guest signs in or registers.
 *
 * @param guestObjectId - The GuestSession._id (MongoDB ObjectId string) used as userId in sub-collections
 * @param userId - The authenticated user's ID to migrate data to
 */
export async function migrateGuestData(
  guestObjectId: string,
  userId: string
): Promise<void> {
  if (
    !mongoose.Types.ObjectId.isValid(guestObjectId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return;
  }

  await connectDB();

  const [
    JobApplication,
    Post,
    ScrapedData,
    ActivityLog,
    DailyUsage,
    LeadGenCampaign,
    GuestSession,
  ] = await Promise.all([
    import("@/lib/db/models/job-application").then((m) => m.default),
    import("@/lib/db/models/post").then((m) => m.default),
    import("@/lib/db/models/scraped-data").then((m) => m.default),
    import("@/lib/db/models/activity-log").then((m) => m.default),
    import("@/lib/db/models/daily-usage").then((m) => m.default),
    import("@/lib/db/models/lead-gen-campaign").then((m) => m.default),
    import("@/lib/db/models/guest-session").then((m) => m.default),
  ]);

  const guestOid = new mongoose.Types.ObjectId(guestObjectId);
  const userOid = new mongoose.Types.ObjectId(userId);

  await Promise.allSettled([
    JobApplication.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "", expiresAt: "" } }
    ),
    Post.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "", expiresAt: "" } }
    ),
    ScrapedData.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "", expiresAt: "" } }
    ),
    ActivityLog.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "" } }
    ),
    DailyUsage.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "", expiresAt: "" } }
    ),
    LeadGenCampaign.updateMany(
      { userId: guestOid },
      { $set: { userId: userOid }, $unset: { isGuest: "", expiresAt: "" } }
    ),
    // Clean up the guest session document
    GuestSession.deleteOne({ _id: guestOid }),
  ]);
}
