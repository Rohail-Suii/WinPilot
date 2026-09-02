/**
 * Send one application now, or rewrite its draft.
 *
 * The background worker handles the queue on its own clock; this is the manual
 * path — the "send it" button on a row the user just reviewed, and the retry on
 * one that failed. It goes through exactly the same send function as the worker
 * so there is only ever one implementation of what sending means.
 *
 * The daily limit still applies (it is the thing keeping the account healthy),
 * but the minimum gap between sends does not: a person clicking send has made
 * the pacing decision themselves.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import JobOutreach from "@/lib/db/models/job-outreach";
import { getOutreachSettings } from "@/lib/outreach/config";
import { draftApplication, sendOneApplication } from "@/lib/outreach/sender";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

const bodySchema = z.object({
  id: z.string().length(24),
  /** "draft" writes (or rewrites) the email without sending it. */
  action: z.enum(["send", "draft"]).default("send"),
  /** Throw the existing draft away and generate a new one. */
  regenerate: z.boolean().default(false),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = actor.id;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { id, action, regenerate } = parsed.data;

    await connectDB();

    const settings = await getOutreachSettings(userId);
    if (!settings.gmailUser || !settings.appPassword) {
      return NextResponse.json(
        { error: "Connect a Gmail account in Settings before sending" },
        { status: 400 }
      );
    }

    if (action === "draft") {
      const record = await JobOutreach.findOne({ _id: id, userId });
      if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (record.status === "sent") {
        return NextResponse.json({ error: "This has already been sent" }, { status: 409 });
      }

      const draft = await draftApplication(userId, record, settings);
      if (!draft.ok) {
        return NextResponse.json({ error: draft.reason, spamIssues: draft.spamIssues }, { status: 422 });
      }

      record.subject = draft.subject;
      record.body = draft.body;
      // Recorded so the sender can tell a draft written before a resume was
      // uploaded from one written against the file that will actually go out.
      record.attachmentName = draft.attachmentName;
      record.spamScore = draft.spamScore;
      record.spamIssues = draft.spamIssues;
      await record.save();

      return NextResponse.json({
        ok: true,
        subject: draft.subject,
        body: draft.body,
        fit: draft.fit,
        spamScore: draft.spamScore,
        spamIssues: draft.spamIssues,
      });
    }

    // The daily ceiling is the account-safety limit, so it holds even here.
    const sentToday = await JobOutreach.countDocuments({
      userId,
      status: "sent",
      sentAt: { $gte: new Date(Date.now() - DAY_MS) },
    });
    if (sentToday >= settings.dailyLimit) {
      return NextResponse.json(
        {
          error: `You have sent ${sentToday} applications in the last 24 hours, which is your limit. Raise it in Settings if you mean to send more.`,
        },
        { status: 429 }
      );
    }

    // Claim it the same way the worker does, so a manual send and a worker pass
    // can never both take the same record.
    const claimed = await JobOutreach.findOneAndUpdate(
      { _id: id, userId, status: { $in: ["queued", "needs_review", "failed"] } },
      { $set: { status: "sending" } },
      { new: true }
    );
    if (!claimed) {
      return NextResponse.json(
        { error: "This is not in a state that can be sent — it may already be sending or sent" },
        { status: 409 }
      );
    }

    if (regenerate) {
      claimed.subject = undefined;
      claimed.body = undefined;
    }

    const outcome = await sendOneApplication(claimed, settings);

    return NextResponse.json(
      { ok: outcome.ok, status: outcome.status, reason: outcome.reason },
      { status: outcome.ok ? 200 : 422 }
    );
  } catch (error) {
    console.error("[Outreach/Send] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
