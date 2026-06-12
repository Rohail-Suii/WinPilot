"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Check,
  Key,
  FileText,
  Puzzle,
  Settings,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuest } from "@/components/dashboard/dashboard-shell";

const steps = [
  {
    id: 1,
    title: "Add your AI API key",
    description: "We use your own key — it's free with Gemini or Groq",
    icon: Key,
    href: "/dashboard/settings?tab=ai-keys",
  },
  {
    id: 2,
    title: "Upload your resume",
    description: "Our AI will parse and structure it automatically",
    icon: FileText,
    href: "/dashboard/settings?tab=resume",
  },
  {
    id: 3,
    title: "Install the Chrome extension",
    description: "Required for interacting with LinkedIn",
    icon: Puzzle,
    href: "/dashboard/settings?tab=extension",
  },
  {
    id: 4,
    title: "Configure your preferences",
    description: "Set daily limits, working hours, and speed",
    icon: Settings,
    href: "/dashboard/settings?tab=automation",
  },
];

export function GettingStarted() {
  const [isOpen, setIsOpen] = useState(true);
  const [completedSteps, setCompletedSteps] = useState(new Set<number>());
  const isGuest = useGuest();

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/api-keys").then((r) => r.json()).catch(() => ({ keys: [] })),
      fetch("/api/settings/profile").then((r) => r.json()).catch(() => ({})),
      fetch("/api/resume").then((r) => r.json()).catch(() => ({ resumes: [] })),
    ]).then(([keysData, profileData, resumeData]) => {
      const completed = new Set<number>();
      // Step 1: Has at least one API key
      if (keysData.keys?.length > 0) completed.add(1);
      // Step 2: Has at least one resume
      if (resumeData.resumes?.length > 0) completed.add(2);
      // Step 3: Extension connected (stored in local state by extension store, approximate via profile)
      if (profileData.user?.extensionConnectedAt || typeof window !== "undefined" && localStorage.getItem("extension-connected")) completed.add(3);
      // Step 4: Has configured automation settings (dailyLimits set)
      if (profileData.user?.settings?.dailyLimits) completed.add(4);
      setCompletedSteps(completed);
    });
  }, []);

  const progress = (completedSteps.size / steps.length) * 100;

  if (completedSteps.size === steps.length) return null;

  return (
    <div className="dashboard-card rounded-xl overflow-hidden border-[#00E5FF]/10">
      <div
        className="cursor-pointer p-6"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#00E5FF]">
              Getting Started
            </p>
            <span className="text-xs font-medium text-[#444444]">
              {completedSteps.size}/{steps.length} completed
            </span>
          </div>
          {isOpen ? (
            <ChevronUp className="h-5 w-5 text-[#444444]" />
          ) : (
            <ChevronDown className="h-5 w-5 text-[#444444]" />
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1 w-full rounded-full bg-[#1A1A1A]">
          <div
            className="h-1 rounded-full bg-[#00E5FF] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {isOpen && (
        <div className="px-6 pb-6">
          {isGuest && (
            <Link
              href="/register"
              className="flex items-center gap-3 rounded-lg px-4 py-3 mb-2 bg-gradient-to-r from-[#00E5FF]/10 to-[#6366F1]/10 border border-[#00E5FF]/20 hover:border-[#00E5FF]/50 transition-all duration-200 group"
            >
              <div className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-[#00E5FF]/40 group-hover:border-[#00E5FF]">
                <UserPlus className="h-3 w-3 text-[#00E5FF]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#00E5FF]">Create a free account to keep your progress</p>
                <p className="text-xs text-[#555555] mt-0.5">Guest data expires in 48h · sign up and we&apos;ll save everything</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#00E5FF]/50 group-hover:text-[#00E5FF] transition-colors" />
            </Link>
          )}
          <div className="space-y-2">
            {steps.map((step, index) => {
              const isDone = completedSteps.has(step.id);
              return (
                <Link
                  key={step.id}
                  href={isDone ? "#" : step.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-200 group",
                    isDone
                      ? "bg-[#28C840]/5 border border-[#28C840]/10 cursor-default"
                      : "bg-[#0A0A0A] border border-[#222222] hover:border-[#00E5FF]/30 hover:bg-[#00E5FF]/5 cursor-pointer"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#28C840]">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#333333] group-hover:border-[#00E5FF]/50">
                        <span className="text-[10px] font-bold text-[#444444] group-hover:text-[#00E5FF]">{index + 1}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isDone ? "text-[#28C840] line-through" : "text-white"
                      )}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-[#555555] mt-0.5">
                      {step.description}
                    </p>
                  </div>
                  {!isDone && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#333333] group-hover:text-[#00E5FF] transition-colors" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
