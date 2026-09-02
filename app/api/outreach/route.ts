/**
 * The openings the agent found, and what it did about them.
 *
 * GET is the dashboard's whole data source: the list plus the counters above
 * it. PATCH is every action a user can take on one row — approve it, edit the
 * draft before it goes, retarget a bounced address, mark a manual one as done,
 * or dismiss it.
 */

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import JobOutreach, { type OutreachStatus } from "@/lib/db/models/job-outreach";
import { getOutreachSettings } from "@/lib/outreach/config";
import { checkPacing } from "@/lib/outreach/sender";
import { isValidEmail } from "@/lib/email/deliverability";

const LIST_STATUSES: OutreachStatus[] = [
  "queued",
  "sending",
  "sent",
  "failed",
  "needs_manual",
  "needs_review",
  "skipped",
];

export async function GET(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = actor.id;

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const skip = Math.max(0, parseInt(url.searchParams.get("skip") || "0", 10));

    await connectDB();

    const filter: Record<string, unknown> = { userId };
    if (status && LIST_STATUSES.includes(status as OutreachStatus)) {
      filter.status = status;
    }

    const [items, total, counts, settings] = await Promise.all([
      JobOutreach.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // The body can be several kilobytes; the list shows a preview and the
        // row expands from what is already here.
        .select("-history")
        .lean(),
      JobOutreach.countDocuments(filter),
      JobOutreach.aggregate<{ _id: OutreachStatus; count: number }>([
        // Aggregation does not cast strings to ObjectId the way a query does.
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      getOutreachSettings(userId),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of counts) byStatus[row._id] = row.count;

    const pacing = settings.enabled
      ? await checkPacing(userId, settings)
      : { allowed: false, reason: "Email sending is turned off" };

    const sentToday = await JobOutreach.countDocuments({
      userId,
      status: "sent",
      sentAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        _id: item._id.toString(),
        userId: undefined,
      })),
      total,
      byStatus,
      sender: {
        enabled: settings.enabled,
        gmailUser: settings.gmailUser,
        credentialSource: settings.credentialSource,
        dailyLimit: settings.dailyLimit,
        sentToday,
        canSendNow: pacing.allowed,
        pacingReason: pacing.reason,
      },
    });
  } catch (error) {
    console.error("[Outreach] List failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string().length(24),
  action: z.enum(["approve", "dismiss", "mark_handled", "reopen", "edit"]),
  subject: z.string().max(300).optional(),
  body: z.string().max(8000).optional(),
  recipientEmail: z.string().max(254).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { id, action } = parsed.data;

    await connectDB();
    const record = await JobOutreach.findOne({ _id: id, userId: actor.id });
    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (record.status === "sending") {
      return NextResponse.json(
        { error: "This one is being sent right now — try again in a moment" },
        { status: 409 }
      );
    }

    switch (action) {
      case "edit": {
        // Editing an already-sent email would misrepresent what went out.
        if (record.status === "sent") {
          return NextResponse.json({ error: "This has already been sent" }, { status: 409 });
        }
        if (parsed.data.subject !== undefined) record.subject = parsed.data.subject;
        if (parsed.data.body !== undefined) record.body = parsed.data.body;
        if (parsed.data.recipientEmail !== undefined) {
          const email = parsed.data.recipientEmail.trim().toLowerCase();
          if (email && !isValidEmail(email)) {
            return NextResponse.json({ error: "That is not a valid email address" }, { status: 400 });
          }
          record.recipientEmail = email;
          record.channel = email ? "email" : record.applyLinks.length ? "link" : "none";
        }
        if (parsed.data.notes !== undefined) record.notes = parsed.data.notes;
        break;
      }

      case "approve": {
        if (!record.recipientEmail) {
          return NextResponse.json(
            { error: "There is no address to send to — add one first" },
            { status: 400 }
          );
        }
        record.status = "queued";
        record.channel = "email";
        record.nextAttemptAt = new Date();
        record.lastError = undefined;
        // A user approving something explicitly should not be stopped by the
        // attempts a previous automated run burned.
        record.attempts = 0;
        break;
      }

      case "dismiss":
        record.status = "skipped";
        record.nextAttemptAt = undefined;
        break;

      case "mark_handled":
        record.handledAt = new Date();
        if (parsed.data.notes !== undefined) record.notes = parsed.data.notes;
        break;

      case "reopen":
        record.status = record.recipientEmail ? "needs_review" : "needs_manual";
        record.handledAt = undefined;
        record.nextAttemptAt = undefined;
        break;
    }

    await record.save();

    return NextResponse.json({
      ok: true,
      item: { ...record.toObject(), _id: record._id.toString(), userId: undefined },
    });
  } catch (error) {
    console.error("[Outreach] Update failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = new URL(req.url).searchParams.get("id") || "";
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await connectDB();
    const deleted = await JobOutreach.findOneAndDelete({ _id: id, userId: actor.id });
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Outreach] Delete failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
