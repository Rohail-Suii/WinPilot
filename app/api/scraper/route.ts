import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import ScraperConfig from "@/lib/db/models/scraper-config";
import ScrapedData from "@/lib/db/models/scraped-data";
import ActivityLog from "@/lib/db/models/activity-log";
import { scraperConfigSchema } from "@/lib/validators";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { canPerformAction, incrementUsage } from "@/lib/anti-detection/rate-limiter";
import { escapeRegex } from "@/lib/utils";
import { z } from "zod";
import mongoose from "mongoose";

const leadActionSchema = z.object({
  leadId: z.string().min(1),
  actionType: z.enum(["commented", "reached_out", "saved", "dismissed"]),
  content: z.string().optional(),
});

const leadTagSchema = z.object({
  leadId: z.string().min(1),
  tags: z.array(z.string().min(1).max(50)),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "configs";

    await connectDB();

    if (view === "leads") {
      const type = searchParams.get("type");
      const tag = searchParams.get("tag");
      const status = searchParams.get("status");
      const cursor = searchParams.get("cursor");
      const search = searchParams.get("search");
      const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
      const filter: Record<string, unknown> = { userId: session.user.id };
      if (type && !["post", "profile", "company", "job"].includes(type)) {
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
      }
      if (type) filter.type = type;
      if (tag) filter.tags = tag;
      if (cursor) {
        if (!mongoose.Types.ObjectId.isValid(cursor)) {
          return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
        }
        filter._id = { $lt: cursor };
      }

      if (status === "new") {
        filter["actions.0"] = { $exists: false };
      } else if (status === "contacted") {
        filter["actions.type"] = "reached_out";
      } else if (status === "saved") {
        filter["actions.type"] = "saved";
      } else if (status === "dismissed") {
        filter["actions.type"] = "dismissed";
      } else if (status && status !== "") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }

      if (search) {
        const escaped = escapeRegex(search);
        filter.$or = [
          { "data.name": { $regex: escaped, $options: "i" } },
          { "data.title": { $regex: escaped, $options: "i" } },
          { "data.headline": { $regex: escaped, $options: "i" } },
          { "data.companyName": { $regex: escaped, $options: "i" } },
          { "data.content": { $regex: escaped, $options: "i" } },
        ];
      }

      const [leads, total] = await Promise.all([
        ScrapedData.find(filter)
          .sort({ _id: -1 })
          .limit(limit + 1)
          .lean(),
        ScrapedData.countDocuments({ userId: session.user.id, ...(type ? { type } : {}) }),
      ]);

      const allTags = await ScrapedData.distinct("tags", { userId: session.user.id });

      const hasMore = leads.length > limit;
      const results = hasMore ? leads.slice(0, limit) : leads;
      const nextCursor = hasMore ? results[results.length - 1]._id : null;

      return NextResponse.json({ leads: results, nextCursor, hasMore, total, allTags });
    }

    if (view === "stats") {
      const [totalLeads, byType, byStatus] = await Promise.all([
        ScrapedData.countDocuments({ userId: session.user.id }),
        ScrapedData.aggregate([
          { $match: { userId: session.user.id } },
          { $group: { _id: "$type", count: { $sum: 1 } } },
        ]),
        ScrapedData.aggregate([
          { $match: { userId: session.user.id } },
          {
            $facet: {
              new: [{ $match: { "actions.0": { $exists: false } } }, { $count: "count" }],
              contacted: [{ $match: { "actions.type": "reached_out" } }, { $count: "count" }],
              saved: [{ $match: { "actions.type": "saved" } }, { $count: "count" }],
              dismissed: [{ $match: { "actions.type": "dismissed" } }, { $count: "count" }],
            },
          },
        ]),
      ]);

      const statusData = byStatus[0] || {};
      return NextResponse.json({
        totalLeads,
        byType: byType.map((d) => ({ type: d._id, count: d.count })),
        byStatus: {
          new: statusData.new?.[0]?.count || 0,
          contacted: statusData.contacted?.[0]?.count || 0,
          saved: statusData.saved?.[0]?.count || 0,
          dismissed: statusData.dismissed?.[0]?.count || 0,
        },
      });
    }

    const configs = await ScraperConfig.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ configs });
  } catch (error) {
    console.error("[Scraper] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    await connectDB();

    if (action === "lead-action") {
      const body = await req.json();
      const parsed = leadActionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const lead = await ScrapedData.findOneAndUpdate(
        { _id: parsed.data.leadId, userId: session.user.id },
        {
          $push: {
            actions: {
              type: parsed.data.actionType,
              at: new Date(),
              content: parsed.data.content,
            },
          },
        },
        { returnDocument: "after" }
      );

      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      await ActivityLog.create({
        userId: session.user.id,
        action: `lead_${parsed.data.actionType}`,
        module: "scraper",
        details: { leadId: parsed.data.leadId, actionType: parsed.data.actionType },
        status: "success",
        timestamp: new Date(),
      });

      return NextResponse.json({ lead });
    }

    if (action === "lead-tags") {
      const body = await req.json();
      const parsed = leadTagSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const lead = await ScrapedData.findOneAndUpdate(
        { _id: parsed.data.leadId, userId: session.user.id },
        { $set: { tags: parsed.data.tags } },
        { returnDocument: "after" }
      );

      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      return NextResponse.json({ lead });
    }

    // Default: create scraper config
    const { allowed } = await canPerformAction(session.user.id, "scrapes");
    if (!allowed) {
      return NextResponse.json({ error: "Daily scrape limit reached" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = scraperConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const config = await ScraperConfig.create({ ...parsed.data, userId: session.user.id });

    await ActivityLog.create({
      userId: session.user.id,
      action: "scraper_config_created",
      module: "scraper",
      details: { configId: config._id, name: parsed.data.name, type: parsed.data.type },
      status: "success",
      timestamp: new Date(),
    });

    await incrementUsage(session.user.id, "scrapes");

    return NextResponse.json({ config }, { status: 201 });
  } catch (error) {
    console.error("[Scraper] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await connectDB();
    await ScraperConfig.findOneAndDelete({ _id: id, userId: session.user.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Scraper] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
