"use client";

import {
  Send,
  TrendingUp,
  FileText,
  Users,
} from "lucide-react";
import { useDashboardData } from "./dashboard-data-provider";

export function StatsCards() {
  const { stats } = useDashboardData();

  const cards = [
    {
      label: "Total Applied",
      value: stats ? String(stats.totalApplied) : "—",
      change: stats ? `+${stats.appliedThisWeek} this week` : "Loading...",
      icon: Send,
      accent: "#00E5FF",
    },
    {
      label: "Success Rate",
      value: stats ? `${stats.successRate}%` : "—",
      change: stats ? "Response ratio" : "Loading...",
      icon: TrendingUp,
      accent: "#28C840",
    },
    {
      label: "Posts This Week",
      value: stats ? String(stats.postsThisWeek) : "—",
      change: stats ? "LinkedIn posts" : "Loading...",
      icon: FileText,
      accent: "#A855F7",
    },
    {
      label: "Leads Found",
      value: stats ? String(stats.totalLeads) : "—",
      change: stats ? "Scraped leads" : "Loading...",
      icon: Users,
      accent: "#FEBC2E",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((stat) => (
        <div
          key={stat.label}
          className="dashboard-card group rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#444444]">
                {stat.label}
              </p>
              <p className="text-3xl font-bold text-white mt-2 tracking-tight">
                {stat.value}
              </p>
              <p className="text-xs text-[#555555] mt-1.5 font-medium">{stat.change}</p>
            </div>
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${stat.accent}10`, border: `1px solid ${stat.accent}20` }}
            >
              <stat.icon className="h-6 w-6" style={{ color: stat.accent }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
