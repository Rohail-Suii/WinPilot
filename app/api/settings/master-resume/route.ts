/**
 * The resume file that gets attached to every application.
 *
 * Explicitly the user's own document, uploaded once, sent unmodified. The app
 * can generate a tailored PDF elsewhere and that is a different feature: what
 * goes out with a cold application is the file the user chose, so there is
 * never a question of what a recruiter actually received.
 *
 * Stored in Mongo rather than on disk because the app's hosts have ephemeral
 * filesystems — a redeploy would otherwise silently empty every attachment.
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import MasterResume from "@/lib/db/models/master-resume";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

/** Recruiters' mail servers reject large attachments, and Gmail caps at 25MB. */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    // Never select `data` — the file itself has no business in a settings page.
    const resume = await MasterResume.findOne({ userId: actor.id })
      .select("filename contentType size updatedAt")
      .lean();

    if (!resume) return NextResponse.json({ resume: null });

    return NextResponse.json({
      resume: {
        filename: resume.filename,
        contentType: resume.contentType,
        size: resume.size,
        uploadedAt: resume.updatedAt,
      },
    });
  } catch (error) {
    console.error("[Settings/MasterResume] Read failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json(
        { error: "Create an account to store a resume", requiresAuth: true },
        { status: 403 }
      );
    }

    const rateLimit = await checkApiRateLimit(actor.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — keep it under 5MB` },
        { status: 400 }
      );
    }

    const contentType = file.type || "application/pdf";
    if (!ALLOWED_TYPES[contentType]) {
      return NextResponse.json(
        { error: "Upload a PDF, or a Word document. PDF is what recruiters expect." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // A PDF that is not a PDF fails at the recruiter's end, where nobody can
    // see it fail. Check the magic bytes rather than trusting the browser.
    if (contentType === "application/pdf" && buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json(
        { error: "That does not look like a real PDF file" },
        { status: 400 }
      );
    }

    // The filename lands in the recruiter's downloads folder, so it is stripped
    // of paths and kept readable rather than replaced with an id.
    const filename =
      (file.name || "resume.pdf").split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, "").slice(0, 120) ||
      `resume.${ALLOWED_TYPES[contentType]}`;

    await connectDB();
    await MasterResume.findOneAndUpdate(
      { userId: actor.id },
      { $set: { filename, contentType, size: buffer.length, data: buffer } },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      ok: true,
      resume: { filename, contentType, size: buffer.length, uploadedAt: new Date() },
    });
  } catch (error) {
    console.error("[Settings/MasterResume] Upload failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await MasterResume.deleteOne({ userId: actor.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Settings/MasterResume] Delete failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
