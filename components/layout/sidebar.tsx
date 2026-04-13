"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Briefcase,
  Trophy,
  Database,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Zap,
  User,
  Users,
  UserCheck,
  GraduationCap,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/lib/hooks/use-stores";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Job Automation",
    href: "/dashboard/jobs",
    icon: Briefcase,
  },
  {
    label: "Become a Hero",
    href: "/dashboard/hero",
    icon: Trophy,
  },
  {
    label: "Data Scraper",
    href: "/dashboard/scraper",
    icon: Database,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
  },
  {
    label: "Connections",
    href: "/dashboard/connections",
    icon: Users,
  },
  {
    label: "Profile Optimizer",
    href: "/dashboard/profile-optimizer",
    icon: UserCheck,
  },
  {
    label: "Interview Prep",
    href: "/dashboard/interview-prep",
    icon: GraduationCap,
  },
  {
    label: "Market Insights",
    href: "/dashboard/market-insights",
    icon: TrendingUp,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isCollapsed, isMobileOpen, toggle, setMobileOpen } =
    useSidebarStore();

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-screen flex-col border-r border-[#1A1A1A] bg-[#0A0A0A] backdrop-blur-xl sidebar-transition",
          isCollapsed ? "w-18" : "w-70",
          "lg:relative",
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-[#1A1A1A] px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/20">
            <Zap className="h-5 w-5 text-[#00E5FF]" />
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="text-lg font-bold text-white whitespace-nowrap overflow-hidden tracking-tight"
              >
                InPilot
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "text-white"
                        : "text-[#888888] hover:text-white hover:bg-[#1A1A1A]"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-lg bg-[#1A1A1A] border border-[#333333]"
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 30,
                        }}
                      />
                    )}
                    <item.icon
                      className={cn(
                        "relative h-5 w-5 shrink-0 transition-colors",
                        isActive ? "text-[#00E5FF]" : "text-[#444444] group-hover:text-[#888888]"
                      )}
                    />
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          className="relative whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Collapse button */}
        <div className="hidden lg:block border-t border-[#1A1A1A] p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-full justify-center"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* User profile */}
        <div className="border-t border-[#1A1A1A] p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] border border-[#222222]">
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <User className="h-4 w-4 text-[#888888]" />
              )}
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex-1 overflow-hidden"
                >
                  <p className="truncate text-sm font-medium text-white">
                    {session?.user?.name || "User"}
                  </p>
                  <p className="truncate text-xs text-[#444444]">
                    {session?.user?.email}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {!isCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="shrink-0"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4 text-[#444444]" />
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
