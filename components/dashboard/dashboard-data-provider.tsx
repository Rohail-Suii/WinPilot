"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface DashboardStats {
  totalApplied: number;
  totalTracked?: number;
  appliedThisWeek: number;
  successRate: number;
  postsThisWeek: number;
  totalLeads: number;
}

interface ActivityItem {
  _id: string;
  action: string;
  module: string;
  status: string;
  timestamp: string;
}

interface TodayUsage {
  applies: number;
  posts: number;
  scrapes: number;
  profileViews: number;
  messages: number;
}

interface DashboardData {
  stats: DashboardStats | null;
  recentActivity: ActivityItem[];
  todayUsage: TodayUsage | null;
  loading: boolean;
  refresh: () => void;
}

const DashboardDataContext = createContext<DashboardData>({
  stats: null,
  recentActivity: [],
  todayUsage: null,
  loading: true,
  refresh: () => {},
});

export function useDashboardData() {
  return useContext(DashboardDataContext);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [todayUsage, setTodayUsage] = useState<TodayUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setRecentActivity(data.recentActivity || []);
        setTodayUsage(data.todayUsage || null);
      }
    } catch {
      // Will show empty states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <DashboardDataContext.Provider value={{ stats, recentActivity, todayUsage, loading, refresh: fetchData }}>
      {children}
    </DashboardDataContext.Provider>
  );
}
