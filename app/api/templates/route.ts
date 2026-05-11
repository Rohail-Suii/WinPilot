import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import OutreachTemplate from "@/lib/db/models/outreach-template";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { z } from "zod";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  body: z.string().min(1, "Body is required").max(5000),
});

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    await connectDB();
    const templates = await OutreachTemplate.find({ userId: userId })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[Templates] Error:", error);
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

    const body = await req.json();
    const parsed = templateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();
    const template = await OutreachTemplate.create({
      userId: userId,
      ...parsed.data,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("[Templates] Error:", error);
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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = templateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();
    const template = await OutreachTemplate.findOneAndUpdate(
      { _id: id, userId: userId },
      { $set: parsed.data },
      { returnDocument: "after" }
    ).lean();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("[Templates] Error:", error);
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
      return NextResponse.json({ error: "Template ID is required" }, { status: 400 });
    }

    await connectDB();
    const template = await OutreachTemplate.findOneAndDelete({
      _id: id,
      userId: userId,
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Templates] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
