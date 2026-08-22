"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Send,
  TrendingUp,
  FileText,
  Users,
  BarChart3,
  Activity,
  Shield,
  Calendar,
  Briefcase,
  Megaphone,
  Search,
  ChevronRight,
  Eye,
  MessageSquare,
  UserPlus,
  Target,
  Zap,
  PieChart as PieChartIcon,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  totalApplied: number;
  appliedThisWeek: number;
  successRate: number;
  postsThisWeek: number;
  totalLeads: number;
}

interface TodayUsage {
  applies: number;
  posts: number;
  scrapes: number;
  profileViews: number;
  messages: number;
  comments: number;
  connectionRequests: number;
}

interface DailyLimits {
  applies: number;
  posts: number;
  scrapes: number;
  profileViews: number;
  messages: number;
  comments: number;
}

interface ActivityItem {
  _id: string;
  action: string;
  module: string;
  status: string;
  timestamp: string;
}

interface HeatmapDay {
  date: string;
  count: number;
}

interface ModuleBreakdown {
  module: string;
  count: number;
}

interface OverviewData {
  stats: DashboardStats;
  recentActivity: ActivityItem[];
  todayUsage: TodayUsage;
  heatmapData: HeatmapDay[];
  activityByModule: ModuleBreakdown[];
  safetyScore: number;
  dailyLimits: DailyLimits;
  /** false when server-side daily caps are disabled */
  limitsEnforced?: boolean;
}

interface JobsData {
  applicationsOverTime: { date: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  topCompanies: { company: string; count: number }[];
  matchScoreDistribution: { range: string; count: number }[];
}

interface HeroData {
  postsOverTime: { date: string; count: number }[];
  postTypeBreakdown: { type: string; count: number }[];
  engagementOverTime: { date: string; likes: number; comments: number; views: number; shares: number }[];
}

interface ScraperData {
  leadsOverTime: { date: string; count: number }[];
  leadTypeBreakdown: { type: string; count: number }[];
  outreachStats: { action: string; count: number }[];
}

type DateRange = "7d" | "30d" | "90d" | "custom";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1a1f35",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "12px",
  },
};

const PIE_COLORS = ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981", "#EC4899", "#6366F1", "#14B8A6", "#F97316"];

const AXIS_TICK = { fill: "rgba(255,255,255,0.4)", fontSize: 11 };

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/5", className)} />;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SkeletonCard className="h-72 lg:col-span-2" />
        <SkeletonCard className="h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard className="h-80" />
        <SkeletonCard className="h-80" />
      </div>
      <SkeletonCard className="h-64" />
    </div>
  );
}

function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard className={height} />
        <SkeletonCard className={height} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard className={height} />
        <SkeletonCard className={height} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 mb-4">
        <Icon className="h-7 w-7 text-white/20" />
      </div>
      <p className="text-white/40 text-sm font-medium">{title}</p>
      <p className="text-white/25 text-xs mt-1 max-w-[240px]">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usage Progress Bar
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  value,
  limit,
  enforced,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  limit: number;
  enforced: boolean;
  color: string;
  icon: React.ElementType;
}) {
  // With daily caps off, the bar is a volume indicator against a reference
  // level — nothing will block, so it never turns amber/red.
  const pct = limit > 0 ? Math.min((value / limit) * 100, 100) : 0;
  const isWarning = enforced && pct >= 80;
  const isDanger = enforced && pct >= 95;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-white/60">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <span className={cn("text-xs font-medium", isDanger ? "text-red-400" : isWarning ? "text-amber-400" : "text-white/50")}>
          {enforced ? `${value}/${limit}` : `${value} · no limit`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Safety Score Gauge
// ---------------------------------------------------------------------------

function SafetyGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (clampedScore / 100) * circumference;
  const color = clampedScore >= 70 ? "#10B981" : clampedScore >= 40 ? "#F59E0B" : "#EF4444";
  const label = clampedScore >= 70 ? "Safe" : clampedScore >= 40 ? "Caution" : "At Risk";
  const variant = clampedScore >= 70 ? "success" : clampedScore >= 40 ? "warning" : "error";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-32 w-32">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{clampedScore}</span>
          <span className="text-[10px] text-white/40 uppercase tracking-wider">/ 100</span>
        </div>
      </div>
      <Badge variant={variant}>{label}</Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Heatmap (GitHub-style)
// ---------------------------------------------------------------------------

function ActivityHeatmap({ data }: { data: HeatmapDay[] }) {
  const weeks = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((d) => map.set(d.date, d.count));

    const today = new Date();
    const grid: { date: string; count: number; dayOfWeek: number }[][] = [];
    const totalDays = 91; // ~13 weeks

    // Build a flat list of days ending at today
    const days: { date: string; count: number; dayOfWeek: number }[] = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: map.get(key) || 0, dayOfWeek: d.getDay() });
    }

    // Group into weeks (columns)
    let week: typeof days = [];
    days.forEach((day) => {
      if (day.dayOfWeek === 0 && week.length > 0) {
        grid.push(week);
        week = [];
      }
      week.push(day);
    });
    if (week.length > 0) grid.push(week);

    return grid;
  }, [data]);

  const maxCount = useMemo(() => Math.max(1, ...data.map((d) => d.count)), [data]);

  function getColor(count: number) {
    if (count === 0) return "bg-white/5";
    const intensity = count / maxCount;
    if (intensity > 0.75) return "bg-blue-500";
    if (intensity > 0.5) return "bg-blue-500/70";
    if (intensity > 0.25) return "bg-blue-500/40";
    return "bg-blue-500/20";
  }

  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div className="flex gap-1">
      {/* Day labels */}
      <div className="flex flex-col gap-[3px] mr-1">
        {dayLabels.map((label, i) => (
          <div key={i} className="h-[13px] w-6 flex items-center justify-end">
            <span className="text-[9px] text-white/30">{label}</span>
          </div>
        ))}
      </div>
      {/* Weeks */}
      <div className="flex gap-[3px] overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {/* Pad if first week doesn't start on Sunday */}
            {wi === 0 &&
              Array.from({ length: week[0]?.dayOfWeek || 0 }).map((_, i) => (
                <div key={`pad-${i}`} className="h-[13px] w-[13px]" />
              ))}
            {week.map((day) => (
              <div
                key={day.date}
                className={cn("h-[13px] w-[13px] rounded-[2px] transition-colors", getColor(day.count))}
                title={`${day.date}: ${day.count} actions`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel component
// ---------------------------------------------------------------------------

function FunnelChart({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const maxVal = Math.max(1, ...steps.map((s) => s.value));

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const pct = (step.value / maxVal) * 100;
        return (
          <div key={step.label}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <div className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3 w-3 text-white/20 -ml-0.5" />}
                <span className="text-white/60">{step.label}</span>
              </div>
              <span className="text-white font-medium">{step.value.toLocaleString()}</span>
            </div>
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: step.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AnalyticsClient() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [activeTab, setActiveTab] = useState("overview");

  // Overview state
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Jobs state
  const [jobsData, setJobsData] = useState<JobsData | null>(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsFetched, setJobsFetched] = useState(false);

  // Hero state
  const [heroData, setHeroData] = useState<HeroData | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroFetched, setHeroFetched] = useState(false);

  // Scraper state
  const [scraperData, setScraperData] = useState<ScraperData | null>(null);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperFetched, setScraperFetched] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch helpers
  // -----------------------------------------------------------------------

  const fetchOverview = useCallback(async (range: DateRange) => {
    setOverviewLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}&section=overview`);
      if (res.ok) {
        const data: OverviewData = await res.json();
        setOverviewData(data);
      } else {
        toast.error("Failed to load overview data");
      }
    } catch {
      toast.error("Failed to load overview data");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(async (range: DateRange) => {
    setJobsLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}&section=jobs`);
      if (res.ok) {
        const data: JobsData = await res.json();
        setJobsData(data);
      } else {
        toast.error("Failed to load jobs analytics");
      }
    } catch {
      toast.error("Failed to load jobs analytics");
    } finally {
      setJobsLoading(false);
      setJobsFetched(true);
    }
  }, []);

  const fetchHero = useCallback(async (range: DateRange) => {
    setHeroLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}&section=hero`);
      if (res.ok) {
        const data: HeroData = await res.json();
        setHeroData(data);
      } else {
        toast.error("Failed to load hero analytics");
      }
    } catch {
      toast.error("Failed to load hero analytics");
    } finally {
      setHeroLoading(false);
      setHeroFetched(true);
    }
  }, []);

  const fetchScraper = useCallback(async (range: DateRange) => {
    setScraperLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}&section=scraper`);
      if (res.ok) {
        const data: ScraperData = await res.json();
        setScraperData(data);
      } else {
        toast.error("Failed to load scraper analytics");
      }
    } catch {
      toast.error("Failed to load scraper analytics");
    } finally {
      setScraperLoading(false);
      setScraperFetched(true);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  // Fetch overview on mount and date range change
  useEffect(() => {
    fetchOverview(dateRange);
    // Reset fetched flags for other tabs so they re-fetch on next visit
    setJobsFetched(false);
    setHeroFetched(false);
    setScraperFetched(false);
  }, [dateRange, fetchOverview]);

  // Lazy-load tab data
  useEffect(() => {
    if (activeTab === "jobs" && !jobsFetched) {
      fetchJobs(dateRange);
    } else if (activeTab === "hero" && !heroFetched) {
      fetchHero(dateRange);
    } else if (activeTab === "scraper" && !scraperFetched) {
      fetchScraper(dateRange);
    }
  }, [activeTab, dateRange, jobsFetched, heroFetched, scraperFetched, fetchJobs, fetchHero, fetchScraper]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "overview") fetchOverview(dateRange);
    else if (activeTab === "jobs") fetchJobs(dateRange);
    else if (activeTab === "hero") fetchHero(dateRange);
    else if (activeTab === "scraper") fetchScraper(dateRange);
  }, [activeTab, dateRange, fetchOverview, fetchJobs, fetchHero, fetchScraper]);

  const isRefreshing = overviewLoading || jobsLoading || heroLoading || scraperLoading;

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const usageItems = useMemo(() => {
    if (!overviewData) return [];
    const { todayUsage, dailyLimits } = overviewData;
    const enforced = overviewData.limitsEnforced !== false;
    return [
      { label: "Applications", value: todayUsage.applies, limit: dailyLimits.applies, enforced, color: "bg-blue-500", icon: Send },
      { label: "Posts", value: todayUsage.posts, limit: dailyLimits.posts, enforced, color: "bg-purple-500", icon: FileText },
      { label: "Scrapes", value: todayUsage.scrapes, limit: dailyLimits.scrapes, enforced, color: "bg-amber-500", icon: Search },
      { label: "Profile Views", value: todayUsage.profileViews, limit: dailyLimits.profileViews, enforced, color: "bg-emerald-500", icon: Eye },
      { label: "Messages", value: todayUsage.messages, limit: dailyLimits.messages, enforced, color: "bg-pink-500", icon: MessageSquare },
      { label: "Comments", value: todayUsage.comments, limit: dailyLimits.comments, enforced, color: "bg-indigo-500", icon: MessageSquare },
    ];
  }, [overviewData]);

  const moduleChartData = useMemo(() => {
    if (!overviewData?.activityByModule) return [];
    return overviewData.activityByModule.map((m) => ({ name: m.module, value: m.count }));
  }, [overviewData]);

  const timelineData = useMemo(() => {
    if (!overviewData?.recentActivity) return [];
    const hourly = overviewData.recentActivity.reduce<Record<string, number>>((acc, act) => {
      const hour = new Date(act.timestamp).getHours();
      const label = `${hour.toString().padStart(2, "0")}:00`;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(hourly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, count }));
  }, [overviewData]);

  // -----------------------------------------------------------------------
  // Stat cards config
  // -----------------------------------------------------------------------

  const statCards = useMemo(() => {
    const s = overviewData?.stats;
    return [
      {
        label: "Total Applied",
        value: s?.totalApplied ?? 0,
        change: `+${s?.appliedThisWeek ?? 0} this week`,
        icon: Send,
        color: "text-blue-400",
        bgColor: "bg-blue-500/10",
      },
      {
        label: "Success Rate",
        value: `${s?.successRate ?? 0}%`,
        change: "Response ratio",
        icon: TrendingUp,
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10",
      },
      {
        label: "Posts This Week",
        value: s?.postsThisWeek ?? 0,
        change: "LinkedIn posts",
        icon: FileText,
        color: "text-purple-400",
        bgColor: "bg-purple-500/10",
      },
      {
        label: "Total Leads",
        value: s?.totalLeads ?? 0,
        change: "Scraped leads",
        icon: Users,
        color: "text-amber-400",
        bgColor: "bg-amber-500/10",
      },
    ];
  }, [overviewData]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const dateRangeOptions: { label: string; value: DateRange }[] = [
    { label: "7 days", value: "7d" },
    { label: "30 days", value: "30d" },
    { label: "90 days", value: "90d" },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Date Range Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Analytics</h2>
          <p className="text-white/50 mt-1">Track your automation performance and LinkedIn growth</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh data"
            className="h-9 w-9"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
            {dateRangeOptions.map((opt) => (
              <Button
                key={opt.value}
                variant={dateRange === opt.value ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDateRange(opt.value)}
                className={cn(
                  "text-xs",
                  dateRange === opt.value && "bg-white/10 text-white"
                )}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5">
            <Briefcase className="h-4 w-4" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="hero" className="gap-1.5">
            <Megaphone className="h-4 w-4" />
            Hero
          </TabsTrigger>
          <TabsTrigger value="scraper" className="gap-1.5">
            <Search className="h-4 w-4" />
            Scraper
          </TabsTrigger>
        </TabsList>

        {/* ================================================================ */}
        {/* OVERVIEW TAB                                                     */}
        {/* ================================================================ */}
        <TabsContent value="overview">
          {overviewLoading ? (
            <OverviewSkeleton />
          ) : !overviewData ? (
            <EmptyState icon={Activity} title="No data available" description="Start using the automation to see analytics here" />
          ) : (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat) => (
                  <Card key={stat.label} className="hover:border-white/20 transition-colors">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-white/50">{stat.label}</p>
                          <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                          <p className="text-xs text-white/40 mt-1">{stat.change}</p>
                        </div>
                        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", stat.bgColor)}>
                          <stat.icon className={cn("h-6 w-6", stat.color)} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Today's Usage + Safety Score */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-white/50" />
                      Today&apos;s Usage
                    </CardTitle>
                    <CardDescription>Actions performed today versus daily limits</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {usageItems.every((d) => d.value === 0) ? (
                      <EmptyState icon={BarChart3} title="No activity today" description="Usage will be tracked as you use the automation" />
                    ) : (
                      <div className="space-y-4">
                        {usageItems.map((item) => (
                          <UsageBar key={item.label} {...item} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-white/50" />
                      Safety Score
                    </CardTitle>
                    <CardDescription>LinkedIn account health</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-center">
                    <SafetyGauge score={overviewData.safetyScore} />
                  </CardContent>
                </Card>
              </div>

              {/* Activity Heatmap */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-white/50" />
                    Activity Heatmap
                  </CardTitle>
                  <CardDescription>Daily automation activity over the last 13 weeks</CardDescription>
                </CardHeader>
                <CardContent>
                  {(!overviewData.heatmapData || overviewData.heatmapData.length === 0) ? (
                    <EmptyState icon={Calendar} title="No heatmap data" description="Activity history will appear here over time" />
                  ) : (
                    <div className="overflow-x-auto pb-2">
                      <ActivityHeatmap data={overviewData.heatmapData} />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Activity Timeline + Module Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-white/50" />
                      Activity Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {timelineData.length === 0 ? (
                      <EmptyState icon={TrendingUp} title="No timeline data" description="Activity will be charted over time" />
                    ) : (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={timelineData}>
                          <defs>
                            <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Area type="monotone" dataKey="count" stroke="#3B82F6" fill="url(#colorActivity)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-white/50" />
                      Module Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {moduleChartData.length === 0 ? (
                      <EmptyState icon={PieChartIcon} title="No module activity" description="Start using features to see breakdown" />
                    ) : (
                      <div className="flex items-center gap-6">
                        <ResponsiveContainer width="50%" height={200}>
                          <PieChart>
                            <Pie
                              data={moduleChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              strokeWidth={0}
                            >
                              {moduleChartData.map((_, index) => (
                                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip {...tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2 flex-1">
                          {moduleChartData.map((mod, i) => (
                            <div key={mod.name} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="text-white/60 capitalize">{mod.name}</span>
                              </div>
                              <span className="text-white font-medium">{mod.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* JOBS TAB                                                         */}
        {/* ================================================================ */}
        <TabsContent value="jobs">
          {jobsLoading ? (
            <ChartSkeleton />
          ) : !jobsData ? (
            <EmptyState icon={Briefcase} title="No job analytics" description="Apply to jobs to see analytics here" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Applications Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-white/50" />
                      Applications Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!jobsData.applicationsOverTime || jobsData.applicationsOverTime.length === 0) ? (
                      <EmptyState icon={Send} title="No application data" description="Apply to jobs to see the trend" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={jobsData.applicationsOverTime}>
                          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="count" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Status Funnel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-white/50" />
                      Application Funnel
                    </CardTitle>
                    <CardDescription>From discovery to offer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(!jobsData.statusBreakdown || jobsData.statusBreakdown.length === 0) ? (
                      <EmptyState icon={Target} title="No funnel data" description="Application progress will be shown here" />
                    ) : (
                      <FunnelChart
                        steps={jobsData.statusBreakdown.map((s, i) => ({
                          label: s.status.charAt(0).toUpperCase() + s.status.slice(1),
                          value: s.count,
                          color: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"][i % 4],
                        }))}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Companies */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-white/50" />
                      Top Companies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!jobsData.topCompanies || jobsData.topCompanies.length === 0) ? (
                      <EmptyState icon={Briefcase} title="No company data" description="Companies will appear as you apply" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={jobsData.topCompanies} layout="vertical">
                          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <YAxis dataKey="company" type="category" tick={AXIS_TICK} axisLine={false} tickLine={false} width={100} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="count" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Match Score Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-white/50" />
                      Match Score Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!jobsData.matchScoreDistribution || jobsData.matchScoreDistribution.length === 0) ? (
                      <EmptyState icon={Zap} title="No match score data" description="Match scores will be shown here" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={jobsData.matchScoreDistribution}>
                          <XAxis dataKey="range" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="count" fill="#10B981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* HERO TAB                                                         */}
        {/* ================================================================ */}
        <TabsContent value="hero">
          {heroLoading ? (
            <ChartSkeleton />
          ) : !heroData ? (
            <EmptyState icon={Megaphone} title="No hero analytics" description="Create posts to see analytics here" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Posts Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-white/50" />
                      Posts Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!heroData.postsOverTime || heroData.postsOverTime.length === 0) ? (
                      <EmptyState icon={FileText} title="No post data" description="Create posts to see the trend" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={heroData.postsOverTime}>
                          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Line type="monotone" dataKey="count" stroke="#8B5CF6" strokeWidth={2} dot={{ fill: "#8B5CF6", r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Post Type Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-white/50" />
                      Post Type Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!heroData.postTypeBreakdown || heroData.postTypeBreakdown.length === 0) ? (
                      <EmptyState icon={PieChartIcon} title="No post type data" description="Post types will be shown here" />
                    ) : (
                      <div className="flex items-center gap-6">
                        <ResponsiveContainer width="50%" height={220}>
                          <PieChart>
                            <Pie
                              data={heroData.postTypeBreakdown.map((d) => ({ name: d.type, value: d.count }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              strokeWidth={0}
                            >
                              {heroData.postTypeBreakdown.map((_, index) => (
                                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip {...tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2 flex-1">
                          {heroData.postTypeBreakdown.map((item, i) => (
                            <div key={item.type} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="text-white/60 capitalize">{item.type}</span>
                              </div>
                              <span className="text-white font-medium">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Engagement Over Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-white/50" />
                    Engagement Over Time
                  </CardTitle>
                  <CardDescription>Likes, comments, views, and shares</CardDescription>
                </CardHeader>
                <CardContent>
                  {(!heroData.engagementOverTime || heroData.engagementOverTime.length === 0) ? (
                    <EmptyState icon={TrendingUp} title="No engagement data" description="Engagement metrics will be charted here" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={heroData.engagementOverTime}>
                        <defs>
                          <linearGradient id="colorLikes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorComments" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorShares" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...tooltipStyle} />
                        <Area type="monotone" dataKey="views" stroke="#10B981" fill="url(#colorViews)" strokeWidth={2} stackId="1" />
                        <Area type="monotone" dataKey="likes" stroke="#3B82F6" fill="url(#colorLikes)" strokeWidth={2} stackId="1" />
                        <Area type="monotone" dataKey="comments" stroke="#8B5CF6" fill="url(#colorComments)" strokeWidth={2} stackId="1" />
                        <Area type="monotone" dataKey="shares" stroke="#F59E0B" fill="url(#colorShares)" strokeWidth={2} stackId="1" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ================================================================ */}
        {/* SCRAPER TAB                                                      */}
        {/* ================================================================ */}
        <TabsContent value="scraper">
          {scraperLoading ? (
            <ChartSkeleton />
          ) : !scraperData ? (
            <EmptyState icon={Search} title="No scraper analytics" description="Scrape leads to see analytics here" />
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Leads Over Time */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-white/50" />
                      Leads Found Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!scraperData.leadsOverTime || scraperData.leadsOverTime.length === 0) ? (
                      <EmptyState icon={Users} title="No lead data" description="Scrape leads to see the trend" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={scraperData.leadsOverTime}>
                          <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="count" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Lead Type Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5 text-white/50" />
                      Lead Type Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!scraperData.leadTypeBreakdown || scraperData.leadTypeBreakdown.length === 0) ? (
                      <EmptyState icon={PieChartIcon} title="No lead type data" description="Lead types will be shown here" />
                    ) : (
                      <div className="flex items-center gap-6">
                        <ResponsiveContainer width="50%" height={220}>
                          <PieChart>
                            <Pie
                              data={scraperData.leadTypeBreakdown.map((d) => ({ name: d.type, value: d.count }))}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              strokeWidth={0}
                            >
                              {scraperData.leadTypeBreakdown.map((_, index) => (
                                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip {...tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2 flex-1">
                          {scraperData.leadTypeBreakdown.map((item, i) => (
                            <div key={item.type} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="text-white/60 capitalize">{item.type}</span>
                              </div>
                              <span className="text-white font-medium">{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Outreach Funnel */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-white/50" />
                    Outreach Funnel
                  </CardTitle>
                  <CardDescription>From lead discovery to conversion</CardDescription>
                </CardHeader>
                <CardContent>
                  {(!scraperData.outreachStats || scraperData.outreachStats.length === 0) ? (
                    <EmptyState icon={UserPlus} title="No outreach data" description="Outreach progress will be shown here" />
                  ) : (
                    <FunnelChart
                      steps={scraperData.outreachStats.map((s, i) => ({
                        label: s.action.charAt(0).toUpperCase() + s.action.slice(1),
                        value: s.count,
                        color: ["#3B82F6", "#8B5CF6", "#F59E0B", "#10B981"][i % 4],
                      }))}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
