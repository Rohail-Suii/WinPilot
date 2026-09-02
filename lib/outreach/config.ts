/**
 * The user's sending account, resolved and decrypted.
 *
 * Two sources, in order: the per-user settings saved from the dashboard, and
 * the process environment. The environment fallback exists because this app is
 * routinely run as a single-operator deployment where the Gmail account IS the
 * deployment's account — but it is a fallback, never an override, so a user who
 * has configured their own credentials can never be made to send as someone
 * else.
 */

import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import { decrypt } from "@/lib/utils/encryption";
import { normalizeAppPassword } from "@/lib/email/gmail-smtp";

export interface OutreachSettings {
  enabled: boolean;
  gmailUser: string;
  appPassword: string;
  fromName: string;
  signature: string;
  dailyLimit: number;
  minGapMinutes: number;
  ccSelf: boolean;
  /** Below this detection confidence the post waits for a human. */
  minConfidence: number;
  /** Require a tool the user has actually used, not just their line of work. */
  strictSkillMatch: boolean;
  /** Where the credentials came from — shown in Settings so it is never a mystery. */
  credentialSource: "user" | "env" | "none";
}

export const OUTREACH_DEFAULTS = {
  dailyLimit: 20,
  minGapMinutes: 6,
  ccSelf: true,
  minConfidence: 0.6,
  strictSkillMatch: false,
};

/**
 * The deployment-wide Gmail credentials, if any.
 *
 * `GMAIL_USER` / `GMAIL_APP_PASSWORD` — screaming snake case like every other
 * variable this app reads, so it is obvious in a Render dashboard which entries
 * belong to it.
 */
export function envGmailCredentials(): { user: string; appPassword: string } | null {
  const user = (process.env.GMAIL_USER || "").trim();
  const appPassword = normalizeAppPassword(process.env.GMAIL_APP_PASSWORD || "");
  if (!user || !appPassword) return null;
  return { user, appPassword };
}

/**
 * Everything the sender needs for one user, or `enabled: false` with the reason
 * implicit in the empty credentials.
 *
 * The app password is `select: false` on the schema, so it has to be asked for
 * explicitly — which is exactly the property that keeps it out of every other
 * query in the codebase.
 */
export async function getOutreachSettings(userId: string): Promise<OutreachSettings> {
  await connectDB();

  // `+path` alone, with no inclusion list beside it: mixing a deselected
  // subpath with a projection over its own parent is the kind of thing that
  // silently returns undefined, and an undefined password here reads as "not
  // configured" rather than as an error.
  const user = await User.findById(userId)
    .select("+emailOutreach.encryptedAppPassword")
    .lean();

  const config = user?.emailOutreach;
  const env = envGmailCredentials();

  let gmailUser = (config?.gmailUser || "").trim();
  let appPassword = "";
  let credentialSource: OutreachSettings["credentialSource"] = "none";

  if (gmailUser && config?.encryptedAppPassword) {
    try {
      appPassword = normalizeAppPassword(decrypt(config.encryptedAppPassword));
      credentialSource = "user";
    } catch {
      // A key rotation makes the stored password undecryptable. Fall through to
      // the environment rather than throwing inside the send loop.
      appPassword = "";
    }
  }

  if (!appPassword && env) {
    gmailUser = env.user;
    appPassword = env.appPassword;
    credentialSource = "env";
  }

  return {
    // Sending is opt-in per user, and impossible without credentials whatever
    // the flag says.
    enabled: Boolean(config?.enabled) && Boolean(gmailUser && appPassword),
    gmailUser,
    appPassword,
    fromName: (config?.fromName || user?.name || "").trim(),
    signature: config?.signature || "",
    dailyLimit: config?.dailyLimit ?? OUTREACH_DEFAULTS.dailyLimit,
    minGapMinutes: config?.minGapMinutes ?? OUTREACH_DEFAULTS.minGapMinutes,
    ccSelf: config?.ccSelf ?? OUTREACH_DEFAULTS.ccSelf,
    minConfidence: config?.minConfidence ?? OUTREACH_DEFAULTS.minConfidence,
    strictSkillMatch: config?.strictSkillMatch ?? OUTREACH_DEFAULTS.strictSkillMatch,
    credentialSource,
  };
}
