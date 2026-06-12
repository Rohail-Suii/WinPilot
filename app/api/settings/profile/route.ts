import { NextResponse } from "next/server";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { getActorId } from "@/lib/utils/get-actor-id";

const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .optional(),
});

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    // Guests have no User document — return empty profile
    if (isGuest) {
      return NextResponse.json({ name: null, email: null, image: null, settings: null, createdAt: null });
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

    return NextResponse.json({
      name: user.name,
      email: user.email,
      image: user.image,
      settings: user.settings,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("[Settings/Profile] Error:", error);
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

    // Guests cannot change profile settings
    if (isGuest) {
      return NextResponse.json(
        { error: "Create a free account to save profile settings", requiresAuth: true },
        { status: 403 }
      );
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();
    const { name, currentPassword, newPassword } = parsed.data;

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }

      const user = await User.findById(userId).select("+hashedPassword");
      if (!user?.hashedPassword) {
        return NextResponse.json({ error: "Cannot change password for OAuth accounts" }, { status: 400 });
      }

      const isValid = await bcrypt.compare(currentPassword, user.hashedPassword);
      if (!isValid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }

      user.hashedPassword = await bcrypt.hash(newPassword, 12);
      if (name) user.name = name;
      await user.save();
    } else if (name) {
      await User.findByIdAndUpdate(userId, { name });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/Profile] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
