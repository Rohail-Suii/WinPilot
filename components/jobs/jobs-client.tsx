"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Briefcase,
  Plus,
  Trash2,
  Search,
  MapPin,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Target,
  TrendingUp,
  BarChart3,
  Eye,
  Star,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  AlertTriangle,
  Terminal,
  ArrowDown,
  Sparkles,
  Settings,
  Key,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { jobSearchSchema } from "@/lib/validators";
import { useExtensionStore } from "@/lib/hooks/use-stores";
import { useWebSocket } from "@/lib/websocket/client";
import { z } from "zod";
import {
  AIKeysTab,
  AutomationTab,
  ResumeTab,
  type ApiKeyInfo,
  type AutomationSettings,
} from "@/components/shared/ai-settings-tabs";

type JobSearchFormValues = z.input<typeof jobSearchSchema>;

interface JobSearchItem {
  _id: string;
  name: string;
  keywords: string;
  location?: string;
  remote: boolean;
  experienceLevel: string[];
  datePosted: string;
  easyApplyOnly: boolean;
  isActive?: boolean;
  createdAt: string;
}

interface JobApplicationItem {
  _id: string;
  jobTitle: string;
  company: string;
  location?: string;
  jobUrl?: string;
  jobDescription?: string;
  status: string;
  matchScore?: number;
  matchBreakdown?: {
    skillsMatch?: number;
    experienceMatch?: number;
    educationMatch?: number;
    matchingSkills?: string[];
    missingSkills?: string[];
    strengths?: string[];
    concerns?: string[];
    recommendation?: string;
  };
  appliedAt?: string;
  notes?: string;
  tailoredResume?: {
    summary?: string;
    skills?: string[];
    highlights?: string[];
    matchExplanation?: string;
    keywordsUsed?: string[];
  };
  formAnswers?: { question: string; answer: string }[];
  createdAt: string;
}

interface ApplicationStats {
  total: number;
  byStatus: Record<string, number>;
  avgMatchScore: number;
  thisWeek: number;
  thisMonth: number;
}

export function JobsClient() {
  const [activeTab, setActiveTab] = useState("searches");
  const [searches, setSearches] = useState<JobSearchItem[]>([]);
  const [applications, setApplications] = useState<JobApplicationItem[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, JobApplicationItem>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Settings tab state
  const [settingsSubTab, setSettingsSubTab] = useState<"ai-keys" | "automation" | "resume">("ai-keys");
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState("");
  const [automationSettings, setAutomationSettings] = useState<AutomationSettings | null>(null);

  const { isConnected, currentTask, lastTaskError, aiQuotaStatus, automationRunning, automationLogs, clearLogs, setAutomationRunning } = useExtensionStore();
  const { startAutomation, stopAutomation } = useWebSocket();
  const [useAI, setUseAI] = useState(true);
  const [useJobMatching, setUseJobMatching] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedAI = window.localStorage.getItem("jobs-automation-use-ai");
    if (savedAI === "false") setUseAI(false);
    const savedMatch = window.localStorage.getItem("jobs-automation-use-matching");
    if (savedMatch === "false") setUseJobMatching(false);
  }, []);

  const handleAiToggle = (checked: boolean) => {
    setUseAI(checked);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jobs-automation-use-ai", String(checked));
    }
    toast.info(
      checked
        ? "AI Resume Tailoring ON: generates tailored resume for each job (uses AI credits)"
        : "AI Resume Tailoring OFF: applies with existing LinkedIn resume",
    );
  };

  const handleMatchToggle = (checked: boolean) => {
    setUseJobMatching(checked);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("jobs-automation-use-matching", String(checked));
    }
    toast.info(
      checked
        ? "Job Matching ON: AI scores jobs against your resume before applying (uses AI credits)"
        : "Job Matching OFF: applies to all eligible jobs without scoring",
    );
  };

  const fetchSearches = useCallback(async () => {
    const res = await fetch("/api/jobs");
    if (res.ok) {
      const data = await res.json();
      setSearches(data.searches);
    }
  }, []);

  const fetchApplications = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ view: "applications" });
    if (statusFilter) params.set("status", statusFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/jobs?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (cursor) {
        setApplications((prev) => [...prev, ...data.applications]);
      } else {
        setApplications(data.applications);
      }
      setAppTotal(data.total ?? 0);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    }
  }, [statusFilter, debouncedSearch]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchApplications(nextCursor);
    setLoadingMore(false);
  };

  const fetchApplicationDetail = async (id: string) => {
    if (expandedDetails[id]) return;
    setLoadingDetail(id);
    const res = await fetch(`/api/jobs/${id}`);
    if (res.ok) {
      const data = await res.json();
      setExpandedDetails((prev) => ({ ...prev, [id]: data.application }));
    }
    setLoadingDetail(null);
  };

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/jobs?view=stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  }, []);

  const fetchApiKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch("/api/settings/api-keys");
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.keys || []);
        setPreferredProvider(data.preferredProvider || "");
      }
    } catch { /* */ }
    setLoadingKeys(false);
  }, []);

  const fetchAutomationSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/automation");
      if (res.ok) {
        const data = await res.json();
        setAutomationSettings(data.settings || null);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSearches(), fetchApplications(), fetchStats(), fetchApiKeys(), fetchAutomationSettings()]).then(() => setLoading(false));
  }, [fetchSearches, fetchApplications, fetchStats, fetchApiKeys, fetchAutomationSettings]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination when filters change
  useEffect(() => {
    setNextCursor(null);
    setHasMore(false);
    setExpandedApp(null);
    setExpandedDetails({});
  }, [statusFilter, debouncedSearch]);

  const deleteSearch = async (id: string) => {
    await fetch(`/api/jobs?id=${id}`, { method: "DELETE" });
    toast.success("Search deleted");
    fetchSearches();
  };

  const handleStartAutomation = (searchId: string) => {
    if (!isConnected) {
      toast.error("Extension not connected. Open LinkedIn in Chrome with the extension enabled.");
      return;
    }
    startAutomation(searchId, { useAI, useJobMatching });
    setAutomationRunning(true);
    toast.success(
      useAI
        ? "Automation started with AI Resume Tailoring."
        : "Automation started without AI tailoring.",
    );
  };

  const handleStopAutomation = () => {
    stopAutomation();
    setAutomationRunning(false);
    toast.info("Automation stopping...");
  };

  // Auto-refresh applications when automation is running
  useEffect(() => {
    if (!automationRunning) return;
    const interval = setInterval(() => {
      fetchApplications();
      fetchStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [automationRunning, fetchApplications, fetchStats]);

  // Refresh data when automation completes
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!automationRunning && wasRunning.current) {
      fetchApplications();
      fetchStats();
    }
    wasRunning.current = automationRunning;
  }, [automationRunning, fetchApplications, fetchStats]);

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [automationLogs.length, autoScroll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Job Automation</h2>
          <p className="text-white/50 mt-1">Configure searches and track applications</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5 text-purple-400/70" />
            <span className="text-xs text-white/70">AI Resume Tailoring</span>
            <Switch checked={useAI} onCheckedChange={handleAiToggle} />
            <span className="text-xs text-white/40">{useAI ? "ON" : "OFF"}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5">
            <Target className="h-3.5 w-3.5 text-cyan-400/70" />
            <span className="text-xs text-white/70">Job Matching</span>
            <Switch checked={useJobMatching} onCheckedChange={handleMatchToggle} />
            <span className="text-xs text-white/40">{useJobMatching ? "ON" : "OFF"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-white/40">{isConnected ? "Extension connected" : "Extension offline"}</span>
          </div>
          {automationRunning && (
            <Button variant="outline" size="sm" onClick={handleStopAutomation} className="text-red-400 border-red-400/30">
              <Square className="h-3.5 w-3.5 mr-1.5" />Stop
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />New Search
          </Button>
        </div>
      </div>

      {/* Automation Status Banner */}
      {currentTask && (
        <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 px-5 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-blue-400 animate-spin shrink-0" />
          <p className="text-sm text-blue-300">{currentTask}</p>
        </div>
      )}

      {lastTaskError && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-amber-200">{lastTaskError}</p>
            {aiQuotaStatus?.provider === "gemini" && (
              <p className="text-xs text-amber-300/90">
                Gemini quota info: model {aiQuotaStatus.model || "gemini-2.5-flash"}, remaining {aiQuotaStatus.remaining ?? 0}
                {typeof aiQuotaStatus.dailyLimit === "number" ? ` / ${aiQuotaStatus.dailyLimit}` : ""}
                {typeof aiQuotaStatus.retryAfterSeconds === "number" && aiQuotaStatus.retryAfterSeconds > 0
                  ? `, retry in ~${aiQuotaStatus.retryAfterSeconds}s.`
                  : "."}
                <span className="ml-1">You can switch AI Resume Tailoring OFF to continue without tailoring.</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stats Overview */}
      {stats && <JobStatsCards stats={stats} />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="searches">
            <Search className="h-4 w-4 mr-2" />Saved Searches
          </TabsTrigger>
          <TabsTrigger value="applications">
            <FileText className="h-4 w-4 mr-2" />Applications ({appTotal})
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Terminal className="h-4 w-4 mr-2" />Logs
            {automationLogs.length > 0 && (
              <Badge variant="default" className="ml-1.5 text-[10px] px-1.5 py-0">{automationLogs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="searches">
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/5" />)}
            </div>
          ) : searches.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-10 w-10 text-white/20" />}
              title="No saved searches"
              description="Create a job search configuration to start auto-applying"
              action={<Button onClick={() => setAddOpen(true)} size="sm"><Plus className="h-4 w-4" />Create Search</Button>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {searches.map((search) => (
                <Card key={search._id} className="hover:border-white/20 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white">{search.name}</h3>
                          {search.easyApplyOnly && <Badge variant="info">Easy Apply</Badge>}
                          {search.remote && <Badge variant="success">Remote</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-white/50">
                          <Search className="h-3.5 w-3.5" />
                          <span>{search.keywords}</span>
                        </div>
                        {search.location && (
                          <div className="flex items-center gap-2 text-sm text-white/40">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{search.location}</span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {search.experienceLevel.map((lvl) => (
                            <Badge key={lvl} variant="default">{lvl}</Badge>
                          ))}
                          {search.datePosted !== "any" && (
                            <Badge variant="default">{search.datePosted}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartAutomation(search._id)}
                          disabled={automationRunning || !isConnected}
                          title={!isConnected ? "Extension not connected" : automationRunning ? "Automation running" : "Start auto-apply"}
                        >
                          <Play className="h-4 w-4 text-emerald-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteSearch(search._id)}>
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications">
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
              <Input
                placeholder="Search by job title or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="found">Found</option>
              <option value="tailoring">Tailoring</option>
              <option value="applying">Applying</option>
              <option value="applied">Applied</option>
              <option value="interview">Interview</option>
              <option value="offered">Offered</option>
              <option value="rejected">Rejected</option>
              <option value="skipped">Skipped</option>
              <option value="failed">Failed</option>
            </Select>
            <span className="text-xs text-white/30 whitespace-nowrap">
              {appTotal} result{appTotal !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-lg bg-white/5" />)}
            </div>
          ) : applications.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10 text-white/20" />}
              title={debouncedSearch ? "No matching applications" : "No applications yet"}
              description={debouncedSearch ? "Try a different search term" : "Applications will appear here once the extension starts applying"}
            />
          ) : (
            <div className="space-y-2">
              {applications.map((app) => {
                const detail = expandedDetails[app._id];
                const isExpanded = expandedApp === app._id;
                return (
                <div key={app._id}>
                  <button
                    onClick={() => {
                      const willExpand = expandedApp !== app._id;
                      setExpandedApp(willExpand ? app._id : null);
                      if (willExpand) fetchApplicationDetail(app._id);
                    }}
                    className="w-full flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-5 py-3 hover:bg-white/[0.07] transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <StatusIcon status={app.status} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{app.jobTitle}</p>
                          {app.matchScore != null && (
                            <MatchScoreBadge score={app.matchScore} />
                          )}
                        </div>
                        <p className="text-xs text-white/40">
                          {app.company}
                          {app.location ? ` · ${app.location}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={statusVariant(app.status)}>{app.status}</Badge>
                      <span className="text-xs text-white/30">
                        {new Date(app.appliedAt || app.createdAt).toLocaleDateString()}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-white/30" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-white/30" />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="ml-4 mt-1 mb-3 rounded-xl bg-white/[0.03] border border-white/5 p-4 space-y-4">
                      {loadingDetail === app._id && (
                        <div className="flex items-center gap-2 text-xs text-white/40">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading details...
                        </div>
                      )}

                      {app.jobUrl && (
                        <a
                          href={app.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View on LinkedIn
                        </a>
                      )}

                      {app.matchScore != null && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-white/60">Match Score</p>
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  app.matchScore >= 80
                                    ? "bg-emerald-500"
                                    : app.matchScore >= 60
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${app.matchScore}%` }}
                              />
                            </div>
                            <span className="text-xs text-white/50">{app.matchScore}%</span>
                          </div>

                          {/* Match Breakdown */}
                          <MatchBreakdownDisplay
                            breakdown={(detail?.matchBreakdown || app.matchBreakdown)}
                            matchExplanation={detail?.tailoredResume?.matchExplanation || app.tailoredResume?.matchExplanation}
                          />
                        </div>
                      )}

                      {/* Job Description */}
                      {detail?.jobDescription && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                            <Briefcase className="h-3 w-3" />Job Description
                          </p>
                          <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3 max-h-[200px] overflow-y-auto">
                            <p className="text-xs text-white/50 whitespace-pre-line leading-relaxed">
                              {detail.jobDescription}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Tailored Resume Content */}
                      {(detail?.tailoredResume || app.tailoredResume) && (
                        (() => {
                          const resume = detail?.tailoredResume || app.tailoredResume;
                          const hasSummary = resume?.summary;
                          const hasSkills = resume?.skills && resume.skills.length > 0;
                          const hasHighlights = resume?.highlights && resume.highlights.length > 0;
                          const hasKeywords = resume?.keywordsUsed && resume.keywordsUsed.length > 0;
                          if (!hasSummary && !hasSkills && !hasHighlights) return null;
                          return (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-white/60 flex items-center gap-1.5">
                                <FileText className="h-3 w-3" />Tailored Resume
                              </p>
                              <div className="rounded-lg bg-gradient-to-b from-white/[0.04] to-white/[0.02] border border-white/10 p-4 space-y-3">
                                {hasSummary && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Professional Summary</p>
                                    <p className="text-xs text-white/70 leading-relaxed">{resume!.summary}</p>
                                  </div>
                                )}
                                {hasSkills && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Key Skills</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {resume!.skills!.map((skill, i) => (
                                        <Badge key={i} variant="info">{skill}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {hasHighlights && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Key Highlights</p>
                                    <ul className="space-y-1">
                                      {resume!.highlights!.map((h, i) => (
                                        <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                                          <span className="text-emerald-400 mt-0.5">•</span>
                                          <span>{h}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {hasKeywords && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">Keywords Matched</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {resume!.keywordsUsed!.map((kw, i) => (
                                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{kw}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      )}

                      {app.formAnswers && app.formAnswers.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-white/60">Form Answers</p>
                          <div className="space-y-1.5">
                            {app.formAnswers.map((qa, i) => (
                              <div key={i} className="text-xs">
                                <span className="text-white/50">Q: {qa.question}</span>
                                <br />
                                <span className="text-white/70">A: {qa.answer}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {app.notes && (
                        <p className="text-xs text-white/40">
                          <span className="text-white/60">Notes:</span> {app.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {/* Load More Pagination */}
              {hasMore && (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs"
                  >
                    {loadingMore ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Loading...</>
                    ) : (
                      <>Load More</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-white/40">{automationLogs.length} log entries</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${
                  autoScroll ? "bg-blue-500/20 text-blue-300" : "bg-white/5 text-white/40"
                }`}
              >
                <ArrowDown className="h-3 w-3" />Auto-scroll
              </button>
              <Button variant="ghost" size="sm" onClick={clearLogs} className="text-xs text-white/40 hover:text-white/60">
                Clear
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-[#0d1117] border border-white/10 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto p-3 font-mono text-xs space-y-0.5">
              {automationLogs.length === 0 ? (
                <p className="text-white/20 text-center py-8">
                  No logs yet. Start an automation to see real-time logs here.
                </p>
              ) : (
                automationLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 py-0.5 hover:bg-white/[0.03] rounded px-1">
                    <span className="text-white/20 shrink-0 tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className={`shrink-0 w-[70px] ${
                      log.source === "api" ? "text-cyan-400/70" :
                      log.source === "content-script" ? "text-purple-400/70" :
                      log.source === "system" ? "text-amber-400/70" :
                      "text-blue-400/70"
                    }`}>
                      [{log.source}]
                    </span>
                    <span className={`${
                      log.level === "error" ? "text-red-400" :
                      log.level === "warn" ? "text-amber-300" :
                      log.level === "success" ? "text-emerald-400" :
                      "text-white/70"
                    }`}>
                      {log.message}
                    </span>
                    {log.details && (
                      <span className="text-white/25 truncate">{log.details}</span>
                    )}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="space-y-4">
            {/* Sub-tab selector */}
            <div className="flex gap-2 border-b border-white/10 pb-3">
              {([
                { id: "ai-keys" as const, label: "AI Keys", icon: Key },
                { id: "automation" as const, label: "Automation", icon: SlidersHorizontal },
                { id: "resume" as const, label: "Resume", icon: FileText },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsSubTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    settingsSubTab === tab.id
                      ? "bg-white/10 text-white border border-white/20"
                      : "bg-white/[0.03] text-white/50 border border-transparent hover:bg-white/[0.06]"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {settingsSubTab === "ai-keys" && (
              <AIKeysTab
                apiKeys={apiKeys}
                loading={loadingKeys}
                addKeyOpen={addKeyOpen}
                setAddKeyOpen={setAddKeyOpen}
                onRefresh={fetchApiKeys}
                preferredProvider={preferredProvider}
                setPreferredProvider={setPreferredProvider}
              />
            )}

            {settingsSubTab === "automation" && (
              <AutomationTab settings={automationSettings} />
            )}

            {settingsSubTab === "resume" && (
              <ResumeTab />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddSearchDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={fetchSearches} />
    </div>
  );
}

// ─── Job Stats Cards ────────────────────────────
function JobStatsCards({ stats }: { stats: ApplicationStats }) {
  const statItems = [
    { label: "Total Applications", value: stats.total, icon: Briefcase, color: "text-blue-400" },
    { label: "This Week", value: stats.thisWeek, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Avg Match", value: `${Math.round(stats.avgMatchScore)}%`, icon: Target, color: "text-purple-400" },
    { label: "Applied", value: stats.byStatus?.applied || 0, icon: CheckCircle2, color: "text-cyan-400" },
    { label: "Interviews", value: stats.byStatus?.interview || 0, icon: Star, color: "text-amber-400" },
    { label: "Offers", value: stats.byStatus?.offered || 0, icon: BarChart3, color: "text-rose-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {statItems.map((item) => (
        <Card key={item.label} className="hover:border-white/20 transition-colors">
          <CardContent className="p-4 text-center">
            <item.icon className={`h-5 w-5 mx-auto mb-1.5 ${item.color}`} />
            <p className="text-lg font-bold text-white">{item.value}</p>
            <p className="text-[11px] text-white/40">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Match Score Badge ──────────────────────────
function MatchScoreBadge({ score }: { score: number }) {
  const variant = score >= 80 ? "success" : score >= 60 ? "warning" : "error";
  return (
    <Badge variant={variant} className="text-[10px] px-1.5 py-0">
      {score}% match
    </Badge>
  );
}

// ─── Match Breakdown Display ────────────────────
function MatchBreakdownDisplay({
  breakdown,
  matchExplanation,
}: {
  breakdown?: JobApplicationItem["matchBreakdown"];
  matchExplanation?: string;
}) {
  if (!breakdown && !matchExplanation) return null;

  const categories = breakdown ? [
    { label: "Skills", value: breakdown.skillsMatch, color: "bg-blue-500" },
    { label: "Experience", value: breakdown.experienceMatch, color: "bg-purple-500" },
    { label: "Education", value: breakdown.educationMatch, color: "bg-cyan-500" },
  ].filter((c) => c.value != null) : [];

  return (
    <div className="space-y-2">
      {categories.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <div key={cat.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">{cat.label}</span>
                <span className="text-[10px] text-white/50">{cat.value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${cat.color} transition-all`}
                  style={{ width: `${cat.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {breakdown?.matchingSkills && breakdown.matchingSkills.length > 0 && (
        <div>
          <p className="text-[10px] text-white/30 mb-1">Matching Skills</p>
          <div className="flex flex-wrap gap-1">
            {breakdown.matchingSkills.map((s, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400/80">{s}</span>
            ))}
          </div>
        </div>
      )}

      {breakdown?.missingSkills && breakdown.missingSkills.length > 0 && (
        <div>
          <p className="text-[10px] text-white/30 mb-1">Missing Skills</p>
          <div className="flex flex-wrap gap-1">
            {breakdown.missingSkills.map((s, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400/80">{s}</span>
            ))}
          </div>
        </div>
      )}

      {breakdown?.strengths && breakdown.strengths.length > 0 && (
        <div>
          <p className="text-[10px] text-white/30 mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {breakdown.strengths.map((s, i) => (
              <li key={i} className="text-[10px] text-white/50 flex items-start gap-1">
                <Check className="h-3 w-3 text-emerald-400/70 mt-0.5 shrink-0" /><span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {breakdown?.concerns && breakdown.concerns.length > 0 && (
        <div>
          <p className="text-[10px] text-white/30 mb-1">Concerns</p>
          <ul className="space-y-0.5">
            {breakdown.concerns.map((s, i) => (
              <li key={i} className="text-[10px] text-white/50 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 text-amber-400/70 mt-0.5 shrink-0" /><span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {breakdown?.recommendation && (
        <p className="text-[10px] text-white/40 italic">{breakdown.recommendation}</p>
      )}

      {matchExplanation && !breakdown && (
        <p className="text-xs text-white/40">{matchExplanation}</p>
      )}
    </div>
  );
}

// ─── Status Icon ────────────────────────────────
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "applied": return <CheckCircle2 className="h-5 w-5 text-blue-400" />;
    case "interview": return <Clock className="h-5 w-5 text-amber-400" />;
    case "offered": return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    case "rejected": return <XCircle className="h-5 w-5 text-red-400" />;
    case "failed": return <XCircle className="h-5 w-5 text-red-400/60" />;
    case "tailoring": return <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />;
    case "applying": return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
    case "found": return <Target className="h-5 w-5 text-cyan-400" />;
    case "skipped": return <XCircle className="h-5 w-5 text-white/30" />;
    default: return <Clock className="h-5 w-5 text-white/30" />;
  }
}

function statusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
    found: "info",
    tailoring: "info",
    applying: "warning",
    applied: "info",
    interview: "warning",
    offered: "success",
    rejected: "error",
    failed: "error",
    skipped: "default",
  };
  return map[status] || "default";
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon}
      <p className="text-white/40 text-sm mt-4">{title}</p>
      <p className="text-white/25 text-xs mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function AddSearchDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<JobSearchFormValues>({
    resolver: zodResolver(jobSearchSchema),
    defaultValues: {
      name: "",
      keywords: "",
      location: "",
      remote: false,
      experienceLevel: [],
      datePosted: "any",
      easyApplyOnly: true,
    },
  });

  const onSubmit = async (data: JobSearchFormValues) => {
    setSaving(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Search created");
      onOpenChange(false);
      reset();
      onSuccess();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to create search");
    }
  };

  const expLevels = [
    { value: "internship", label: "Internship" },
    { value: "entry", label: "Entry" },
    { value: "associate", label: "Associate" },
    { value: "mid-senior", label: "Mid-Senior" },
    { value: "director", label: "Director" },
    { value: "executive", label: "Executive" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Job Search</DialogTitle>
          <DialogDescription>Configure a new job search for auto-apply</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label>Search Name</Label>
            <Input placeholder="Senior React Developer" {...register("name")} />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Keywords</Label>
            <Input placeholder="React, TypeScript, Frontend" {...register("keywords")} />
            {errors.keywords && <p className="text-xs text-red-400">{errors.keywords.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <Input placeholder="New York, Remote, etc." {...register("location")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date Posted</Label>
              <Select {...register("datePosted")}>
                <option value="any">Any time</option>
                <option value="past-24h">Past 24 hours</option>
                <option value="past-week">Past week</option>
                <option value="past-month">Past month</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Experience</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {expLevels.map((lvl) => (
                  <label key={lvl.value} className="flex items-center gap-1 text-xs text-white/60 bg-white/5 rounded-md px-2 py-1 cursor-pointer hover:bg-white/10 transition-colors">
                    <input type="checkbox" value={lvl.value} {...register("experienceLevel")} className="accent-blue-500 h-3 w-3" />
                    {lvl.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input type="checkbox" {...register("remote")} className="accent-blue-500" />
              Remote only
            </label>
            <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
              <input type="checkbox" {...register("easyApplyOnly")} className="accent-blue-500" />
              Easy Apply only
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : "Create Search"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
