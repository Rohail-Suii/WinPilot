import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import { z } from "zod";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

const automationSettingsSchema = z.object({
  dailyLimits: z.object({
    applies: z.number().min(1).max(50),
    posts: z.number().min(1).max(10),
    scrapes: z.number().min(1).max(200),
  }).optional(),
  timezone: z.string().optional(),
  notificationPrefs: z.object({
    email: z.boolean(),
    inApp: z.boolean(),
    extension: z.boolean(),
  }).optional(),
  useAIFormFilling: z.boolean().optional(),
});

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
    const user = await User.findById(session.user.id).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ settings: user.settings });
  } catch (error) {
    console.error("[Settings/Automation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
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
    const parsed = automationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();
    const update: Record<string, unknown> = {};
    if (parsed.data.dailyLimits) {
      update["settings.dailyLimits"] = parsed.data.dailyLimits;
    }
    if (parsed.data.timezone) {
      update["settings.timezone"] = parsed.data.timezone;
    }
    if (parsed.data.notificationPrefs) {
      update["settings.notificationPrefs"] = parsed.data.notificationPrefs;
    }
    if (parsed.data.useAIFormFilling !== undefined) {
      update["settings.useAIFormFilling"] = parsed.data.useAIFormFilling;
    }

    await User.findByIdAndUpdate(session.user.id, { $set: update });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/Automation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
