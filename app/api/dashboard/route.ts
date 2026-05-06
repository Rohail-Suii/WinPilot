import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import JobApplication from "@/lib/db/models/job-application";
import Post from "@/lib/db/models/post";
import ScrapedData from "@/lib/db/models/scraped-data";
import ActivityLog from "@/lib/db/models/activity-log";
import DailyUsage from "@/lib/db/models/daily-usage";
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

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split("T")[0];

    const [
      totalApplied,
      _appliedThisWeek,
      appliedCount,
      interviewCount,
      postsThisWeek,
      totalLeads,
      recentActivity,
      todayUsage,
    ] = await Promise.all([
      JobApplication.countDocuments({ userId }),
      JobApplication.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
      JobApplication.countDocuments({ userId, status: "applied" }),
      JobApplication.countDocuments({ userId, status: "interview" }),
      Post.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
      ScrapedData.countDocuments({ userId }),
      ActivityLog.find({ userId })
        .sort({ timestamp: -1 })
        .limit(10)
        .lean(),
      DailyUsage.findOne({ userId, date: today }).lean(),
    ]);

    // Calculate applied this week (status = "applied")
    const appliedThisWeekActual = await JobApplication.countDocuments({ 
      userId, 
      status: "applied",
      appliedAt: { $gte: weekAgo } 
    });

    const successRate = totalApplied > 0
      ? Math.round(((appliedCount + interviewCount) / totalApplied) * 100)
      : 0;

    return NextResponse.json({
      stats: {
        totalApplied: appliedCount, // Return actual applied count (status="applied"), not total records
        totalTracked: totalApplied, // Total job records tracked (all statuses)
        appliedThisWeek: appliedThisWeekActual, // Applied this week with status="applied"
        successRate,
        postsThisWeek,
        totalLeads,
      },
      recentActivity,
      todayUsage: todayUsage?.actions || { applies: 0, posts: 0, scrapes: 0, profileViews: 0, messages: 0 },
    }, {
      headers: {
        "Cache-Control": "private, max-age=10, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("[Dashboard] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
