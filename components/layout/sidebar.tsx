"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Bot,
  Briefcase,
  Trophy,
  Database,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Users,
  UserCheck,
  GraduationCap,
  TrendingUp,
  Target,
  MailCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuest } from "@/components/dashboard/dashboard-shell";
import { useSidebarStore } from "@/lib/hooks/use-stores";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Autopilot",
    href: "/dashboard/autopilot",
    icon: Bot,
  },
  {
    label: "Job Automation",
    href: "/dashboard/jobs",
    icon: Briefcase,
  },
  {
    label: "Lead Generation",
    href: "/dashboard/lead-gen",
    icon: Target,
  },
  {
    label: "Job Applications",
    href: "/dashboard/outreach",
    icon: MailCheck,
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
  const isGuest = useGuest();
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#6366F1] shadow-md shadow-[#00E5FF]/20">
            <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5 h-[18px] w-[18px]">
              <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
            </svg>
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="text-lg font-bold whitespace-nowrap overflow-hidden tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent"
              >
                Winpilot
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
          {isGuest ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1A1A1A] border border-[#222222]">
                  <User className="h-4 w-4 text-[#888888]" />
                </div>
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex-1 overflow-hidden"
                    >
                      <p className="truncate text-sm font-medium text-white">Guest</p>
                      <p className="truncate text-xs text-[#444444]">Data expires in 48h</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Link
                      href="/login"
                      className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-[#00E5FF] to-[#6366F1] hover:opacity-90 transition-opacity"
                    >
                      Sign In to Save Progress
                    </Link>
                    <Link
                      href="/register"
                      className="flex w-full items-center justify-center mt-1.5 text-xs text-[#888888] hover:text-white transition-colors"
                    >
                      Create account →
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
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
          )}
        </div>
      </aside>
    </>
  );
}
