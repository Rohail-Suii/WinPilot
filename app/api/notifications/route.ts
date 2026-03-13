import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import Notification from "@/lib/db/models/notification";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

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
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const cursor = searchParams.get("cursor");

    await connectDB();

    const filter: Record<string, unknown> = { userId: session.user.id };
    if (unreadOnly) filter.read = false;
    if (cursor) {
      if (!mongoose.Types.ObjectId.isValid(cursor)) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      filter._id = { $lt: cursor };
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean(),
      Notification.countDocuments({ userId: session.user.id, read: false }),
    ]);

    const hasMore = notifications.length > limit;
    const results = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? results[results.length - 1]._id : null;

    return NextResponse.json({ notifications: results, unreadCount, nextCursor, hasMore });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    await connectDB();

    if (action === "read-all") {
      await Notification.updateMany(
        { userId: session.user.id, read: false },
        { $set: { read: true } }
      );
      return NextResponse.json({ success: true });
    }

    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing notification id" }, { status: 400 });
    }

    await Notification.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: { read: true } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications] Error:", error);
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

    await connectDB();

    if (id === "all") {
      await Notification.deleteMany({ userId: session.user.id });
    } else if (id) {
      await Notification.findOneAndDelete({ _id: id, userId: session.user.id });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notifications] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
