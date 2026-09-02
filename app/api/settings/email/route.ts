/**
 * The Gmail account applications are sent from.
 *
 * The app password is encrypted at rest with the same envelope as the AI keys
 * and is never returned — GET reports only which account is connected and
 * whether a password is stored. Saving one verifies it against Gmail's SMTP
 * server first, so a typo is caught here rather than three hours later inside
 * the send queue.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { getActorId } from "@/lib/utils/get-actor-id";
import User from "@/lib/db/models/user";
import { encrypt } from "@/lib/utils/encryption";
import {
  verifyGmailCredentials,
  normalizeAppPassword,
  sendApplicationEmail,
} from "@/lib/email/gmail-smtp";
import { getOutreachSettings, OUTREACH_DEFAULTS, envGmailCredentials } from "@/lib/outreach/config";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    // The stored password is `select: false`, so it has to be asked for by name
    // — without the `+` the flag below would always report "not set".
    const user = await User.findById(actor.id)
      .select("+emailOutreach.encryptedAppPassword")
      .lean();
    const config = user?.emailOutreach;
    const env = envGmailCredentials();

    return NextResponse.json({
      enabled: Boolean(config?.enabled),
      gmailUser: config?.gmailUser || "",
      hasAppPassword: Boolean(config?.encryptedAppPassword),
      fromName: config?.fromName || user?.name || "",
      signature: config?.signature || "",
      dailyLimit: config?.dailyLimit ?? OUTREACH_DEFAULTS.dailyLimit,
      minGapMinutes: config?.minGapMinutes ?? OUTREACH_DEFAULTS.minGapMinutes,
      ccSelf: config?.ccSelf ?? OUTREACH_DEFAULTS.ccSelf,
      minConfidence: config?.minConfidence ?? OUTREACH_DEFAULTS.minConfidence,
      strictSkillMatch: config?.strictSkillMatch ?? OUTREACH_DEFAULTS.strictSkillMatch,
      verifiedAt: config?.verifiedAt || null,
      /** A deployment-wide account is available as a fallback. */
      envAccount: env?.user || "",
    });
  } catch (error) {
    console.error("[Settings/Email] Read failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const saveSchema = z.object({
  gmailUser: z.string().email().max(254).optional(),
  /** Google shows it in groups of four; the spaces are stripped before use. */
  appPassword: z.string().min(16).max(64).optional(),
  enabled: z.boolean().optional(),
  fromName: z.string().max(120).optional(),
  signature: z.string().max(600).optional(),
  dailyLimit: z.number().int().min(1).max(400).optional(),
  minGapMinutes: z.number().int().min(1).max(240).optional(),
  ccSelf: z.boolean().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  strictSkillMatch: z.boolean().optional(),
  /** Send a test message to the connected account itself. */
  test: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json(
        { error: "Create an account to connect Gmail", requiresAuth: true },
        { status: 403 }
      );
    }
    const userId = actor.id;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const parsed = saveSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const input = parsed.data;

    await connectDB();

    const update: Record<string, unknown> = {};
    const set = (key: keyof typeof input, field: string) => {
      if (input[key] !== undefined) update[`emailOutreach.${field}`] = input[key];
    };

    set("enabled", "enabled");
    set("fromName", "fromName");
    set("signature", "signature");
    set("dailyLimit", "dailyLimit");
    set("minGapMinutes", "minGapMinutes");
    set("ccSelf", "ccSelf");
    set("minConfidence", "minConfidence");
    set("strictSkillMatch", "strictSkillMatch");

    // Credentials are verified before they are stored: an app password that
    // does not authenticate is worse than none, because the queue would build
    // up behind it.
    if (input.gmailUser && input.appPassword) {
      const credentials = {
        user: input.gmailUser.trim(),
        appPassword: normalizeAppPassword(input.appPassword),
      };
      const verified = await verifyGmailCredentials(credentials);
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: 400 });
      }

      update["emailOutreach.gmailUser"] = credentials.user;
      update["emailOutreach.encryptedAppPassword"] = encrypt(credentials.appPassword);
      update["emailOutreach.verifiedAt"] = new Date();
    } else if (input.gmailUser || input.appPassword) {
      return NextResponse.json(
        { error: "Give both the Gmail address and its app password" },
        { status: 400 }
      );
    }

    if (Object.keys(update).length > 0) {
      await User.updateOne({ _id: userId }, { $set: update });
    }

    if (input.test) {
      const settings = await getOutreachSettings(userId);
      if (!settings.gmailUser || !settings.appPassword) {
        return NextResponse.json({ error: "No Gmail account connected yet" }, { status: 400 });
      }
      try {
        await sendApplicationEmail({
          credentials: { user: settings.gmailUser, appPassword: settings.appPassword },
          fromName: settings.fromName,
          to: settings.gmailUser,
          subject: "WinPilot test message",
          body: `This is a test from WinPilot, sent through your own Gmail account.

If it arrived in your inbox rather than Spam or Promotions, the account is ready to send job applications.

Sending account: ${settings.gmailUser}`,
        });
      } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true, tested: Boolean(input.test) });
  } catch (error) {
    console.error("[Settings/Email] Save failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Disconnect the account. Sending stops; the history of what was sent stays. */
export async function DELETE() {
  try {
    const actor = await getActorId();
    if (!actor || actor.isGuest) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await User.updateOne(
      { _id: actor.id },
      {
        $set: {
          "emailOutreach.enabled": false,
          "emailOutreach.gmailUser": "",
          "emailOutreach.encryptedAppPassword": "",
          "emailOutreach.verifiedAt": null,
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Settings/Email] Disconnect failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
