import { auth } from "@/auth";
import { cookies } from "next/headers";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const cookieStore = await cookies();
  const guestUuid = cookieStore.get("guestId")?.value;

  const isGuest = !session?.user;
  // If user just signed in and still has a guest UUID cookie, trigger data migration
  const needsMigration = !!(
    session?.user?.id &&
    guestUuid &&
    UUID_REGEX.test(guestUuid)
  );

  return (
    <DashboardShell isGuest={isGuest} needsMigration={needsMigration}>
      {children}
    </DashboardShell>
  );
}
