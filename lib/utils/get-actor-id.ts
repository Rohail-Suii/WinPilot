import { auth } from "@/auth";
import { cookies } from "next/headers";
import connectDB from "@/lib/db/connection";
import GuestSession from "@/lib/db/models/guest-session";
import User from "@/lib/db/models/user";

export const GUEST_COOKIE = "guestId";
export const GUEST_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

/** UUID v4 validation regex */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** MongoDB ObjectId validation regex */
const OBJECTID_REGEX = /^[0-9a-f]{24}$/i;

export interface ActorId {
  id: string;
  isGuest: boolean;
}

/**
 * Validates if a string is a valid MongoDB ObjectId (24-char hex)
 */
function isValidObjectId(id: string): boolean {
  return OBJECTID_REGEX.test(id);
}

/**
 * Resolves the acting user's ID from either:
 *  1. A valid NextAuth session (authenticated user)
 *  2. A valid guestId UUID cookie (guest user backed by GuestSession in DB)
 *
 * For guests, lazily creates a GuestSession document on first call (atomic upsert).
 * Returns null if neither source is present/valid.
 *
 * Also handles legacy sessions that may have OAuth provider IDs (UUIDs) by
 * resolving them to their MongoDB ObjectId.
 */
export async function getActorId(): Promise<ActorId | null> {
  const session = await auth();
  if (session?.user?.id) {
    let userId = session.user.id;

    // Handle legacy OAuth sessions that may have UUIDs instead of ObjectIds
    if (!isValidObjectId(userId) && UUID_REGEX.test(userId)) {
      // UUID found - resolve it to the user's ObjectId via email
      await connectDB();
      const user = await User.findOne({ email: session.user.email }).lean();
      if (user) {
        userId = user._id.toString();
      }
    }

    return { id: userId, isGuest: false };
  }

  const cookieStore = await cookies();
  const guestUuid = cookieStore.get(GUEST_COOKIE)?.value;
  if (!guestUuid || !UUID_REGEX.test(guestUuid)) {
    return null;
  }

  await connectDB();

  // Find or create the GuestSession for this UUID (atomic upsert, safe for concurrent requests)
  const gs = await GuestSession.findOneAndUpdate(
    { uuid: guestUuid },
    {
      $setOnInsert: {
        uuid: guestUuid,
        expiresAt: new Date(Date.now() + GUEST_TTL_MS),
        createdAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  return { id: gs._id.toString(), isGuest: true };
}

/**
 * Resolve the acting user from a dashboard session/guest cookie OR the
 * extension's `x-auth-token` header.
 *
 * The extension has no cookies for our origin, so it authenticates with the
 * stored userId token instead. Guests can never run the extension, so a token
 * only ever resolves to a real User.
 */
export async function resolveRequestUserId(req: Request): Promise<string | null> {
  const actor = await getActorId();
  if (actor) return actor.id;

  const token = req.headers.get("x-auth-token");
  if (token && isValidObjectId(token)) {
    await connectDB();
    const user = await User.exists({ _id: token });
    if (user) return token;
  }
  return null;
}
