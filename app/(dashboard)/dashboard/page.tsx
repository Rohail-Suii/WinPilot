import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { DashboardDataProvider } from "@/components/dashboard/dashboard-data-provider";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { QuickStartCards } from "@/components/dashboard/quick-start-cards";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { GettingStarted } from "@/components/dashboard/getting-started";
import { CardSkeleton } from "@/components/ui/spinner";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your InPilot dashboard - track automation and activity.",
};

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-8 max-w-[1400px]">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Welcome back, {session?.user?.name?.split(" ")[0] || "there"}
        </h2>
        <p className="text-[#888888] mt-1 text-sm">
          Here&apos;s your LinkedIn automation overview
        </p>
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
