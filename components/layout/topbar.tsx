"use client";

import { usePathname } from "next/navigation";
import { Menu, Plug, PlugZap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/lib/hooks/use-stores";
import { useExtensionStore } from "@/lib/hooks/use-stores";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notifications/notification-center";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/jobs": "Job Automation",
  "/dashboard/hero": "Become a Hero",
  "/dashboard/scraper": "Data Scraper",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
};

export function Topbar() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebarStore();
  const { isConnected } = useExtensionStore();

  const title =
    Object.entries(routeTitles).find(([path]) =>
      pathname === path || (path !== "/dashboard" && pathname.startsWith(path))
    )?.[1] || "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#1A1A1A] bg-[#0A0A0A]/85 backdrop-blur-xl px-4 lg:px-8">
      {/* Left: Mobile menu + title */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Extension Status */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium border",
            isConnected
              ? "bg-[#00E5FF]/5 text-[#00E5FF] border-[#00E5FF]/20"
              : "bg-[#111111] text-[#444444] border-[#1A1A1A]"
          )}
        >
          {isConnected ? (
            <PlugZap className="h-3.5 w-3.5" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {isConnected ? "Extension Connected" : "Extension Offline"}
          </span>
        </div>

        {/* Notifications */}
        <NotificationCenter />
      </div>
    </header>
  );
}
