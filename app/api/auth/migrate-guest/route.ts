import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import connectDB from "@/lib/db/connection";
import GuestSession from "@/lib/db/models/guest-session";
import { migrateGuestData } from "@/lib/utils/migrate-guest-data";
import { GUEST_COOKIE } from "@/lib/utils/get-actor-id";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const guestUuid = cookieStore.get(GUEST_COOKIE)?.value;
    if (!guestUuid || !UUID_REGEX.test(guestUuid)) {
      // No guest session to migrate — nothing to do
      return NextResponse.json({ ok: true, migrated: false });
    }

    await connectDB();
    const gs = await GuestSession.findOne({ uuid: guestUuid }).lean();
    if (!gs) {
      // Guest session already expired or never created
      const res = NextResponse.json({ ok: true, migrated: false });
      res.cookies.delete(GUEST_COOKIE);
      return res;
    }

    await migrateGuestData(gs._id.toString(), session.user.id);

    const res = NextResponse.json({ ok: true, migrated: true });
    res.cookies.delete(GUEST_COOKIE);
    return res;
  } catch (error) {
    console.error("[MigrateGuest] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
