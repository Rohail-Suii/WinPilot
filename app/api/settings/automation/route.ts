import { NextResponse } from "next/server";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import GuestSession from "@/lib/db/models/guest-session";
import { DAILY_LIMITS_ENFORCED } from "@/lib/anti-detection/rate-limiter";
import { z } from "zod";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { getActorId } from "@/lib/utils/get-actor-id";

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
  resumeTailoringSource: z.enum(["resume", "data"]).optional(),
});

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    // Guests have no User document — defaults, except the AI resume source
    // which is persisted on their session so the choice survives a reload.
    if (isGuest) {
      await connectDB();
      const guest = await GuestSession.findById(userId).lean();
      return NextResponse.json({
        settings: {
          timezone: "UTC",
          language: "en",
          notificationPrefs: { email: true, inApp: true, extension: true },
          dailyLimits: { applies: 15, posts: 2, scrapes: 50 },
          resumeTailoringSource:
            guest?.resumeTailoringSource === "data" ? "data" : "resume",
          limitsEnforced: DAILY_LIMITS_ENFORCED,
        },
      });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();
    const user = await User.findById(userId).lean();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // limitsEnforced tells the UI whether the daily caps below actually block
    // automation, or are just stored preferences (they are off by default).
    return NextResponse.json({
      settings: { ...user.settings, limitsEnforced: DAILY_LIMITS_ENFORCED },
    });
  } catch (error) {
    console.error("[Settings/Automation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = automationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Guests get one persisted preference — the AI resume source — because the
    // tailoring pipeline reads it; limits/notifications still need an account.
    if (isGuest) {
      if (parsed.data.resumeTailoringSource === undefined) {
        return NextResponse.json(
          { error: "Create a free account to save automation settings", requiresAuth: true },
          { status: 403 }
        );
      }

      await connectDB();
      await GuestSession.findByIdAndUpdate(userId, {
        $set: { resumeTailoringSource: parsed.data.resumeTailoringSource },
      });

      const skippedOtherSettings =
        parsed.data.dailyLimits !== undefined ||
        parsed.data.notificationPrefs !== undefined ||
        parsed.data.timezone !== undefined ||
        parsed.data.useAIFormFilling !== undefined;

      return NextResponse.json({
        success: true,
        guest: true,
        savedFields: ["resumeTailoringSource"],
        ...(skippedOtherSettings
          ? { notice: "Create a free account to save daily limits and notifications." }
          : {}),
      });
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
    if (parsed.data.resumeTailoringSource !== undefined) {
      update["settings.resumeTailoringSource"] = parsed.data.resumeTailoringSource;
    }

    await User.findByIdAndUpdate(userId, { $set: update });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/Automation] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
