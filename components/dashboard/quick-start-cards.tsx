"use client";

import Link from "next/link";
import { Briefcase, Trophy, Database, ArrowRight } from "lucide-react";

const features = [
  {
    title: "Job Automation",
    description: "Auto-apply to LinkedIn Easy Apply jobs with AI-tailored resumes",
    href: "/dashboard/jobs",
    icon: Briefcase,
    accent: "#00E5FF",
    command: "winpilot apply --jobs 50",
  },
  {
    title: "Become a Hero",
    description: "Build your LinkedIn brand with AI-generated content & engagement",
    href: "/dashboard/hero",
    icon: Trophy,
    accent: "#A855F7",
    command: "winpilot post --schedule",
  },
  {
    title: "Data Scraper",
    description: "Find leads, scrape posts, and automate personalized outreach",
    href: "/dashboard/scraper",
    icon: Database,
    accent: "#FEBC2E",
    command: "winpilot scrape --export",
  },
];

export function QuickStartCards() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#444444] mb-4">
        Quick Start
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {features.map((feature) => (
          <Link key={feature.href} href={feature.href}>
            <div className="dashboard-card group cursor-pointer rounded-xl p-6 min-h-50 flex flex-col">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg mb-4"
                style={{ background: `${feature.accent}10`, border: `1px solid ${feature.accent}20` }}
              >
                <feature.icon className="h-5 w-5" style={{ color: feature.accent }} />
              </div>
              <h4 className="text-base font-semibold text-white mb-1 tracking-tight">
                {feature.title}
              </h4>
              <p className="text-sm text-[#666666] mb-4 leading-relaxed">
                {feature.description}
              </p>
              <code className="mt-auto block text-xs text-[#00E5FF] bg-[#0A0A0A] border border-[#222222] rounded-md px-3 py-2 font-mono">
                {feature.command}
              </code>
              <div className="flex items-center gap-1 text-sm font-medium text-[#00E5FF] mt-4 group-hover:gap-2 transition-all">
                Get started
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
