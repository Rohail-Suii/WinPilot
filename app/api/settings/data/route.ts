import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import bcrypt from "bcryptjs";
import User from "@/lib/db/models/user";
import Resume from "@/lib/db/models/resume";
import JobApplication from "@/lib/db/models/job-application";
import JobSearch from "@/lib/db/models/job-search";
import HeroProfile from "@/lib/db/models/hero-profile";
import Post from "@/lib/db/models/post";
import ScrapedData from "@/lib/db/models/scraped-data";
import ScraperConfig from "@/lib/db/models/scraper-config";
import ActivityLog from "@/lib/db/models/activity-log";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();
    const userId = session.user.id;

    const MAX_RECORDS = 500;

    const [user, resumes, applications, searches, heroProfile, posts, scrapedData, scraperConfigs, activityLogs] =
      await Promise.all([
        User.findById(userId).lean(),
        Resume.find({ userId }).limit(MAX_RECORDS).lean(),
        JobApplication.find({ userId }).limit(MAX_RECORDS).lean(),
        JobSearch.find({ userId }).limit(MAX_RECORDS).lean(),
        HeroProfile.findOne({ userId }).lean(),
        Post.find({ userId }).limit(MAX_RECORDS).lean(),
        ScrapedData.find({ userId }).limit(MAX_RECORDS).lean(),
        ScraperConfig.find({ userId }).limit(MAX_RECORDS).lean(),
        ActivityLog.find({ userId }).sort({ timestamp: -1 }).limit(MAX_RECORDS).lean(),
      ]);

    // Remove sensitive fields
    if (user) {
      delete (user as unknown as Record<string, unknown>).hashedPassword;
      if (user.aiApiKeys) {
        user.aiApiKeys = user.aiApiKeys.map((k) => ({
          provider: k.provider,
          isValid: k.isValid,
          encryptedKey: "[REDACTED]",
        }));
      }
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      user,
      resumes,
      jobSearches: searches,
      jobApplications: applications,
      heroProfile,
      posts,
      scrapedData,
      scraperConfigs,
      activityLogs,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="linkedboost-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("[Settings/Data] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Password is required to delete account" }, { status: 400 });
    }

    await connectDB();
    const userId = session.user.id;

    const user = await User.findById(session.user.id).select("+hashedPassword");
    if (!user?.hashedPassword) {
      return NextResponse.json({ error: "Cannot verify password for OAuth accounts" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isValid) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
    }

    await Promise.all([
      Resume.deleteMany({ userId }),
      JobApplication.deleteMany({ userId }),
      JobSearch.deleteMany({ userId }),
      HeroProfile.deleteMany({ userId }),
      Post.deleteMany({ userId }),
      ScrapedData.deleteMany({ userId }),
      ScraperConfig.deleteMany({ userId }),
      ActivityLog.deleteMany({ userId }),
      User.findByIdAndDelete(userId),
    ]);

    return NextResponse.json({ success: true, message: "Account and all data deleted" });
  } catch (error) {
    console.error("[Settings/Data] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
