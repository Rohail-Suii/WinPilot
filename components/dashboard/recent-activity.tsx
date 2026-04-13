"use client";

import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { useDashboardData } from "./dashboard-data-provider";

export function RecentActivity() {
  const { recentActivity: activities } = useDashboardData();

  return (
    <div className="dashboard-card rounded-xl">
      <div className="p-6 pb-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#444444]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-[#444444]">
            Recent Activity
          </p>
        </div>
      </div>
      <div className="px-6 pb-6">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-xl bg-[#0A0A0A] border border-[#222222] flex items-center justify-center mb-4">
              <Clock className="h-8 w-8 text-[#333333]" />
            </div>
            <p className="text-[#555555] text-sm font-medium">No activity yet</p>
            <p className="text-[#333333] text-xs mt-1">
              Your automation activity will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div
                key={activity._id}
                className="flex items-center justify-between rounded-lg bg-[#0A0A0A] border border-[#1A1A1A] px-4 py-3 hover:border-[#333333] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant={activity.status === "success" ? "success" : "error"}>
                    {activity.status}
                  </Badge>
                  <div>
                    <span className="text-sm text-white font-medium">{activity.action}</span>
                    <span className="text-xs text-[#444444] ml-2 font-mono">{activity.module}</span>
                  </div>
                </div>
                <span className="text-xs text-[#444444] font-mono">
                  {formatTimestamp(activity.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
