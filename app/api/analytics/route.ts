import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import JobApplication from "@/lib/db/models/job-application";
import Post from "@/lib/db/models/post";
import ScrapedData from "@/lib/db/models/scraped-data";
import ActivityLog from "@/lib/db/models/activity-log";
import DailyUsage from "@/lib/db/models/daily-usage";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

export async function GET(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "30d";
    const section = searchParams.get("section") || "overview";

    await connectDB();

    const now = new Date();
    let daysBack = 30;
    if (range === "7d") daysBack = 7;
    else if (range === "90d") daysBack = 90;
    else if (range === "365d") daysBack = 365;
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    if (section === "jobs") {
      const [
        applicationsOverTime,
        statusBreakdown,
        topCompanies,
        matchScoreDistribution,
      ] = await Promise.all([
        // Applications per day
        JobApplication.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        // Status breakdown
        JobApplication.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        // Top companies applied to
        JobApplication.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          { $group: { _id: "$company", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
        // Match score distribution
        JobApplication.aggregate([
          { $match: { userId, matchScore: { $exists: true, $gt: 0 }, createdAt: { $gte: startDate } } },
          {
            $bucket: {
              groupBy: "$matchScore",
              boundaries: [0, 20, 40, 60, 80, 100],
              default: "100+",
              output: { count: { $sum: 1 } },
            },
          },
        ]),
      ]);

      return NextResponse.json({
        applicationsOverTime: applicationsOverTime.map((d) => ({ date: d._id, count: d.count })),
        statusBreakdown: statusBreakdown.map((d) => ({ status: d._id, count: d.count })),
        topCompanies: topCompanies.map((d) => ({ company: d._id, count: d.count })),
        matchScoreDistribution: matchScoreDistribution.map((d) => ({
          range: `${d._id}-${(d._id as number) + 20}%`,
          count: d.count,
        })),
      });
    }

    if (section === "hero") {
      const [
        postsOverTime,
        postTypeBreakdown,
        engagementOverTime,
      ] = await Promise.all([
        Post.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Post.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),
        Post.aggregate([
          { $match: { userId, status: "posted", createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$postedAt" } },
              likes: { $sum: "$engagement.likes" },
              comments: { $sum: "$engagement.comments" },
              views: { $sum: "$engagement.views" },
              shares: { $sum: "$engagement.shares" },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return NextResponse.json({
        postsOverTime: postsOverTime.map((d) => ({ date: d._id, count: d.count })),
        postTypeBreakdown: postTypeBreakdown.map((d) => ({ type: d._id, count: d.count })),
        engagementOverTime: engagementOverTime.map((d) => ({
          date: d._id,
          likes: d.likes,
          comments: d.comments,
          views: d.views,
          shares: d.shares,
        })),
      });
    }

    if (section === "scraper") {
      const [
        leadsOverTime,
        leadTypeBreakdown,
        outreachStats,
      ] = await Promise.all([
        ScrapedData.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        ScrapedData.aggregate([
          { $match: { userId, createdAt: { $gte: startDate } } },
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),
        ScrapedData.aggregate([
          { $match: { userId, "actions.0": { $exists: true }, createdAt: { $gte: startDate } } },
          { $unwind: "$actions" },
          { $group: { _id: "$actions.type", count: { $sum: 1 } } },
        ]),
      ]);

      return NextResponse.json({
        leadsOverTime: leadsOverTime.map((d) => ({ date: d._id, count: d.count })),
        leadTypeBreakdown: leadTypeBreakdown.map((d) => ({ type: d._id, count: d.count })),
        outreachStats: outreachStats.map((d) => ({ action: d._id, count: d.count })),
      });
    }

    // Default: overview section
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split("T")[0];

    const [
      totalApplied,
      appliedThisWeek,
      appliedCount,
      interviewCount,
      postsThisWeek,
      totalLeads,
      recentActivity,
      todayUsage,
      dailyActivity,
      activityByModule,
    ] = await Promise.all([
      JobApplication.countDocuments({ userId }),
      JobApplication.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
      JobApplication.countDocuments({ userId, status: "applied" }),
      JobApplication.countDocuments({ userId, status: "interview" }),
      Post.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
      ScrapedData.countDocuments({ userId }),
      ActivityLog.find({ userId }).sort({ timestamp: -1 }).limit(20).lean(),
      DailyUsage.findOne({ userId, date: today }).lean(),
      // Daily activity for heatmap (last N days)
      DailyUsage.find({ userId })
        .sort({ date: -1 })
        .limit(daysBack)
        .lean(),
      // Activity breakdown by module
      ActivityLog.aggregate([
        { $match: { userId, timestamp: { $gte: startDate } } },
        { $group: { _id: "$module", count: { $sum: 1 } } },
      ]),
    ]);

    const successRate =
      totalApplied > 0
        ? Math.round(((appliedCount + interviewCount) / totalApplied) * 100)
        : 0;

    // Build heatmap data
    const heatmapData = dailyActivity.map((d) => ({
      date: d.date,
      count:
        (d.actions?.applies || 0) +
        (d.actions?.posts || 0) +
        (d.actions?.scrapes || 0) +
        (d.actions?.profileViews || 0) +
        (d.actions?.messages || 0) +
        (d.actions?.comments || 0),
    }));

    // Safety score
    const todayActions = todayUsage?.actions || {
      applies: 0,
      posts: 0,
      scrapes: 0,
      profileViews: 0,
      messages: 0,
      comments: 0,
      connectionRequests: 0,
    };
    const maxLimits = { applies: 15, posts: 2, scrapes: 50, profileViews: 30, messages: 10, comments: 15 };
    const usageRatios = [
      todayActions.applies / maxLimits.applies,
      todayActions.posts / maxLimits.posts,
      todayActions.scrapes / maxLimits.scrapes,
      todayActions.profileViews / maxLimits.profileViews,
      todayActions.messages / maxLimits.messages,
      (todayActions.comments || 0) / maxLimits.comments,
    ];
    const avgUsage = usageRatios.reduce((a, b) => a + b, 0) / usageRatios.length;
    const safetyScore = Math.max(0, Math.round((1 - avgUsage) * 100));

    return NextResponse.json({
      stats: {
        totalApplied,
        appliedThisWeek,
        successRate,
        postsThisWeek,
        totalLeads,
      },
      recentActivity,
      todayUsage: todayActions,
      heatmapData,
      activityByModule: activityByModule.map((d) => ({ module: d._id, count: d.count })),
      safetyScore,
      dailyLimits: maxLimits,
    }, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[Analytics] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
