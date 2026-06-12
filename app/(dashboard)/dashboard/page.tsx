import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickStartCards } from "@/components/dashboard/quick-start-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { CardSkeleton } from "@/components/ui/spinner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your Winpilot dashboard - track automation and activity.",
};

export default async function DashboardPage() {
  const session = await auth();
  const cookieStore = await cookies();
  const isGuest = !session?.user && !!cookieStore.get("guestId")?.value;

  return (
    <div className="space-y-8 max-w-[1400px]">
      {/* Welcome */}
      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {isGuest
                ? "Welcome to Winpilot"
                : `Welcome back, ${session?.user?.name?.split(" ")[0] || "there"}`}
            </h2>
            {isGuest && (
              <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                Guest Mode
              </span>
            )}
          </div>
          <p className="text-[#888888] mt-1 text-sm">
            {isGuest
              ? "You're exploring as a guest · sign in to save your progress"
              : "Here\u2019s your LinkedIn automation overview"}
          </p>
        </div>
      </div>

      <DashboardDataProvider>
        {/* Stats */}
        <Suspense
          fallback={
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <StatsCards />
        </Suspense>

        {/* Getting Started Checklist (for new users) */}
        <GettingStarted />

        {/* Quick Start */}
        <QuickStartCards />

        {/* Recent Activity */}
        <Suspense
          fallback={
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          }
        >
          <RecentActivity />
        </Suspense>
      </DashboardDataProvider>
    </div>
  );
}
