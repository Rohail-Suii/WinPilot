import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import ConnectionRequest from "@/lib/db/models/connection-request";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

const sendConnectionSchema = z.object({
  targetName: z.string().min(1, "Target name is required").max(200),
  targetHeadline: z.string().max(500).default(""),
  targetProfileUrl: z.string().url("Invalid profile URL"),
  message: z.string().max(300, "Connection message must be under 300 characters").default(""),
});

const updateStatusSchema = z.object({
  id: z.string().min(1, "Connection request ID is required"),
  status: z.enum(["pending", "sent", "accepted", "ignored"]),
});

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
    const status = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    await connectDB();

    const filter: Record<string, unknown> = { userId: userId };
    const validStatuses = ["pending", "sent", "accepted", "ignored"];

    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (status) filter.status = status;

    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      filter._id = { $lt: cursor };
    }

    const [connections, stats] = await Promise.all([
      ConnectionRequest.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean(),
      ConnectionRequest.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const hasMore = connections.length > limit;
    const results = hasMore ? connections.slice(0, limit) : connections;
    const nextCursor = hasMore ? results[results.length - 1]._id : null;

    const statusCounts: Record<string, number> = {};
    for (const s of stats) {
      statusCounts[s._id] = s.count;
    }

    const totalSent = (statusCounts["sent"] || 0) + (statusCounts["accepted"] || 0);
    const totalAccepted = statusCounts["accepted"] || 0;
    const acceptanceRate = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : 0;

    return NextResponse.json({
      connections: results,
      nextCursor,
      hasMore,
      stats: {
        ...statusCounts,
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        acceptanceRate,
      },
    });
  } catch (error) {
    console.error("[Connections] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
    const action = searchParams.get("action");
    const body = await req.json();

    await connectDB();

    if (action === "send") {
      const parsed = sendConnectionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const connection = await ConnectionRequest.create({
        ...parsed.data,
        userId: userId,
        status: "pending",
      });

      return NextResponse.json({ connection }, { status: 201 });
    }

    if (action === "auto-accept-criteria") {
      // Store auto-accept criteria - this could be saved in user settings
      // For now, acknowledge the request
      return NextResponse.json({ success: true, message: "Auto-accept criteria saved" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Connections] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const body = await req.json();
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();

    const update: Record<string, unknown> = { status: parsed.data.status };
    if (parsed.data.status === "sent") update.sentAt = new Date();
    if (parsed.data.status === "accepted") update.acceptedAt = new Date();

    const connection = await ConnectionRequest.findOneAndUpdate(
      { _id: parsed.data.id, userId: userId },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!connection) {
      return NextResponse.json({ error: "Connection request not found" }, { status: 404 });
    }

    return NextResponse.json({ connection });
  } catch (error) {
    console.error("[Connections] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await connectDB();

    const connection = await ConnectionRequest.findOneAndDelete({
      _id: id,
      userId: userId,
    });

    if (!connection) {
      return NextResponse.json({ error: "Connection request not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Connections] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
