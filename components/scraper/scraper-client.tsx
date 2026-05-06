"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Database,
  Plus,
  Trash2,
  Loader2,
  Users,
  FileText,
  Building2,
  Search,
  ExternalLink,
  Bookmark,
  Send,
  X,
  Tag,
  Mail,
  EyeOff,
  Copy,
  Pencil,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Filter,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { scraperConfigSchema } from "@/lib/validators";
import { cn, formatRelativeTime } from "@/lib/utils";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScraperConfigFormValues = z.input<typeof scraperConfigSchema>;

interface ScraperConfigItem {
  _id: string;
  name: string;
  type: string;
  keywords: string[];
  maxResults: number;
  isActive?: boolean;
  createdAt: string;
}

interface LeadAction {
  type: "commented" | "reached_out" | "saved" | "dismissed";
  at: string;
  content?: string;
}

interface LeadItem {
  _id: string;
  type: string;
  data: Record<string, string>;
  source?: { url: string; scrapedAt: string };
  tags: string[];
  actions: LeadAction[];
  createdAt: string;
}

interface LeadStats {
  totalLeads: number;
  byType: { type: string; count: number }[];
  byStatus: {
    new: number;
    contacted: number;
    saved: number;
    dismissed: number;
  };
}

interface OutreachTemplate {
  _id: string;
  id?: string;
  name: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_VARIABLES = ["{{name}}", "{{company}}", "{{headline}}"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeIcon(type: string) {
  switch (type) {
    case "profiles":
    case "profile":
      return <Users className="h-4 w-4 text-blue-400" />;
    case "posts":
    case "post":
      return <FileText className="h-4 w-4 text-purple-400" />;
    case "companies":
    case "company":
      return <Building2 className="h-4 w-4 text-amber-400" />;
    default:
      return <Database className="h-4 w-4 text-white/40" />;
  }
}

function getLeadDisplayName(lead: LeadItem): string {
  return (
    lead.data?.name ||
    lead.data?.title ||
    lead.data?.companyName ||
    "Unnamed Lead"
  );
}

function getLeadHeadline(lead: LeadItem): string {
  return (
    lead.data?.headline ||
    lead.data?.description ||
    lead.data?.content?.slice(0, 120) ||
    ""
  );
}

function getLeadStatus(
  lead: LeadItem
): "new" | "contacted" | "saved" | "dismissed" {
  if (!lead.actions || lead.actions.length === 0) return "new";
  const types = lead.actions.map((a) => a.type);
  if (types.includes("dismissed")) return "dismissed";
  if (types.includes("saved")) return "saved";
  if (types.includes("reached_out")) return "contacted";
  return "new";
}

function statusBadgeVariant(
  status: string
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "new":
      return "info";
    case "contacted":
      return "success";
    case "saved":
      return "warning";
    case "dismissed":
      return "error";
    default:
      return "default";
  }
}

function highlightVariables(text: string): React.ReactNode[] {
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) =>
    part.match(/^{{[^}]+}}$/) ? (
      <span
        key={i}
        className="rounded bg-blue-500/20 px-1 py-0.5 text-blue-400 font-mono text-xs"
      >
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

async function loadTemplatesFromServer(): Promise<OutreachTemplate[]> {
  try {
    const res = await fetch("/api/templates");
    if (res.ok) {
      const data = await res.json();
      return data.templates || [];
    }
    return [];
  } catch {
    return [];
  }
}

async function saveTemplateToServer(template: { name: string; body: string }): Promise<OutreachTemplate | null> {
  try {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    if (res.ok) {
      const data = await res.json();
      return data.template;
    }
    return null;
  } catch {
    return null;
  }
}

async function updateTemplateOnServer(id: string, template: { name: string; body: string }): Promise<OutreachTemplate | null> {
  try {
    const res = await fetch(`/api/templates?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    });
    if (res.ok) {
      const data = await res.json();
      return data.template;
    }
    return null;
  } catch {
    return null;
  }
}

async function deleteTemplateFromServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ScraperClient() {
  const [activeTab, setActiveTab] = useState("configs");

  // Configs state
  const [configs, setConfigs] = useState<ScraperConfigItem[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Leads state
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Lead filters
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Stats state
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Lead action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [tagDialogLead, setTagDialogLead] = useState<LeadItem | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [editingTags, setEditingTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<OutreachTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper");
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs ?? []);
      } else {
        toast.error("Failed to load configurations");
      }
    } catch {
      toast.error("Network error loading configurations");
    }
  }, []);

  const fetchLeads = useCallback(
    async (cursor?: string | null) => {
      const params = new URLSearchParams({ view: "leads" });
      if (typeFilter) params.set("type", typeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (tagFilter) params.set("tag", tagFilter);
      if (searchQuery) params.set("search", searchQuery);
      if (cursor) params.set("cursor", cursor);

      try {
        const res = await fetch(`/api/scraper?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (cursor) {
            setLeads((prev) => [...prev, ...(data.leads ?? [])]);
          } else {
            setLeads(data.leads ?? []);
          }
          setNextCursor(data.nextCursor);
          setHasMore(data.hasMore ?? false);
          setAllTags(data.allTags ?? []);
        } else {
          toast.error("Failed to load leads");
        }
      } catch {
        toast.error("Network error loading leads");
      }
    },
    [typeFilter, statusFilter, tagFilter, searchQuery]
  );

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/scraper?view=stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Stats are non-critical, fail silently
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setConfigsLoading(true);
    fetchConfigs().finally(() => setConfigsLoading(false));
  }, [fetchConfigs]);

  // Load leads when tab switches or filters change
  useEffect(() => {
    if (activeTab === "leads") {
      setLeadsLoading(true);
      Promise.all([fetchLeads(), fetchStats()]).finally(() =>
        setLeadsLoading(false)
      );
    }
  }, [activeTab, fetchLeads, fetchStats]);

  // Load templates from server
  useEffect(() => {
    loadTemplatesFromServer().then(setTemplates);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // -------------------------------------------------------------------------
  // Config actions
  // -------------------------------------------------------------------------

  const deleteConfig = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        const res = await fetch(`/api/scraper?id=${id}`, { method: "DELETE" });
        if (res.ok) {
          toast.success("Configuration deleted");
          fetchConfigs();
        } else {
          toast.error("Failed to delete configuration");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchConfigs]
  );

  // -------------------------------------------------------------------------
  // Lead actions
  // -------------------------------------------------------------------------

  const performLeadAction = useCallback(
    async (
      leadId: string,
      actionType: "commented" | "reached_out" | "saved" | "dismissed",
      content?: string
    ) => {
      setActionLoading(`${leadId}-${actionType}`);
      try {
        const res = await fetch("/api/scraper?action=lead-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, actionType, content }),
        });
        if (res.ok) {
          const data = await res.json();
          setLeads((prev) =>
            prev.map((l) => (l._id === leadId ? { ...l, ...data.lead } : l))
          );
          const actionLabels: Record<string, string> = {
            saved: "Lead saved",
            reached_out: "Marked as contacted",
            dismissed: "Lead dismissed",
            commented: "Comment recorded",
          };
          toast.success(actionLabels[actionType] || "Action recorded");
          fetchStats();
        } else {
          const err = await res.json();
          toast.error(err.error || "Failed to perform action");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setActionLoading(null);
      }
    },
    [fetchStats]
  );

  const updateLeadTags = useCallback(
    async (leadId: string, tags: string[]) => {
      setSavingTags(true);
      try {
        const res = await fetch("/api/scraper?action=lead-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, tags }),
        });
        if (res.ok) {
          const data = await res.json();
          setLeads((prev) =>
            prev.map((l) => (l._id === leadId ? { ...l, ...data.lead } : l))
          );
          toast.success("Tags updated");
          setTagDialogOpen(false);
          // Refresh the allTags list
          fetchLeads();
        } else {
          const err = await res.json();
          toast.error(err.error || "Failed to update tags");
        }
      } catch {
        toast.error("Network error");
      } finally {
        setSavingTags(false);
      }
    },
    [fetchLeads]
  );

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchLeads(nextCursor);
    setLoadingMore(false);
  }, [nextCursor, loadingMore, fetchLeads]);

  // -------------------------------------------------------------------------
  // Template actions
  // -------------------------------------------------------------------------

  const openNewTemplate = useCallback(() => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateBody("");
    setTemplateDialogOpen(true);
  }, []);

  const openEditTemplate = useCallback((template: OutreachTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateBody(template.body);
    setTemplateDialogOpen(true);
  }, []);

  const saveTemplate = useCallback(async () => {
    if (!templateName.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (!templateBody.trim()) {
      toast.error("Template body is required");
      return;
    }

    if (editingTemplate) {
      const id = editingTemplate._id || editingTemplate.id;
      if (!id) return;
      const result = await updateTemplateOnServer(id, {
        name: templateName.trim(),
        body: templateBody.trim(),
      });
      if (result) {
        setTemplates(templates.map((t) =>
          (t._id || t.id) === id ? result : t
        ));
        toast.success("Template updated");
      } else {
        toast.error("Failed to update template");
        return;
      }
    } else {
      const result = await saveTemplateToServer({
        name: templateName.trim(),
        body: templateBody.trim(),
      });
      if (result) {
        setTemplates([result, ...templates]);
        toast.success("Template created");
      } else {
        toast.error("Failed to create template");
        return;
      }
    }

    setTemplateDialogOpen(false);
  }, [templateName, templateBody, editingTemplate, templates]);

  const deleteTemplate = useCallback(
    async (id: string) => {
      const ok = await deleteTemplateFromServer(id);
      if (ok) {
        setTemplates(templates.filter((t) => (t._id || t.id) !== id));
        toast.success("Template deleted");
      } else {
        toast.error("Failed to delete template");
      }
    },
    [templates]
  );

  const copyTemplate = useCallback((body: string) => {
    navigator.clipboard.writeText(body);
    toast.success("Template copied to clipboard");
  }, []);

  // -------------------------------------------------------------------------
  // Tag dialog helpers
  // -------------------------------------------------------------------------

  const openTagDialog = useCallback((lead: LeadItem) => {
    setTagDialogLead(lead);
    setEditingTags([...(lead.tags || [])]);
    setTagInput("");
    setTagDialogOpen(true);
  }, []);

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !editingTags.includes(trimmed)) {
      setEditingTags((prev) => [...prev, trimmed]);
      setTagInput("");
    }
  }, [tagInput, editingTags]);

  const removeTag = useCallback((tag: string) => {
    setEditingTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Data Scraper</h2>
            <p className="text-white/50 mt-1">
              Scrape LinkedIn for leads, manage outreach, and track engagement
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Config
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="configs">
              <Database className="h-4 w-4 mr-2" />
              Configurations
            </TabsTrigger>
            <TabsTrigger value="leads">
              <Users className="h-4 w-4 mr-2" />
              Leads
              {stats && stats.totalLeads > 0 && (
                <Badge variant="info" className="ml-2 text-[10px] px-1.5 py-0">
                  {stats.totalLeads}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Mail className="h-4 w-4 mr-2" />
              Outreach Templates
            </TabsTrigger>
          </TabsList>

          {/* ============================================================= */}
          {/* TAB 1: CONFIGURATIONS                                         */}
          {/* ============================================================= */}
          <TabsContent value="configs">
            {configsLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
            ) : configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-white/5 p-4 mb-4">
                  <Database className="h-10 w-10 text-white/20" />
                </div>
                <p className="text-white/40 text-sm mt-2">
                  No scraper configurations yet
                </p>
                <p className="text-white/25 text-xs mt-1 max-w-sm">
                  Create a configuration to define what to scrape from LinkedIn.
                  The browser extension will use these configs to find leads.
                </p>
                <Button
                  onClick={() => setAddOpen(true)}
                  size="sm"
                  className="mt-4"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Config
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {configs.map((config) => (
                  <Card
                    key={config._id}
                    className="hover:border-white/20 transition-colors group"
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getTypeIcon(config.type)}
                            <h3 className="font-semibold text-white truncate">
                              {config.name}
                            </h3>
                            <Badge variant="info" className="shrink-0">
                              {config.type}
                            </Badge>
                            {config.isActive !== false && (
                              <Badge variant="success" className="shrink-0">
                                Active
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {config.keywords.map((kw) => (
                              <Badge key={kw} variant="default">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-white/30">
                            Max {config.maxResults} results
                            <span className="mx-1.5">--</span>
                            Created{" "}
                            {formatRelativeTime(config.createdAt)}
                          </p>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={() => deleteConfig(config._id)}
                              disabled={deletingId === config._id}
                            >
                              {deletingId === config._id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-400" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete configuration</TooltipContent>
                        </Tooltip>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============================================================= */}
          {/* TAB 2: LEADS                                                   */}
          {/* ============================================================= */}
          <TabsContent value="leads">
            <div className="space-y-4">
              {/* Stats Bar */}
              {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatsCard
                    label="Total Leads"
                    value={stats.totalLeads}
                    icon={<Users className="h-4 w-4 text-blue-400" />}
                    loading={statsLoading}
                  />
                  <StatsCard
                    label="New"
                    value={stats.byStatus.new}
                    icon={<Sparkles className="h-4 w-4 text-cyan-400" />}
                    loading={statsLoading}
                  />
                  <StatsCard
                    label="Contacted"
                    value={stats.byStatus.contacted}
                    icon={<Send className="h-4 w-4 text-green-400" />}
                    loading={statsLoading}
                  />
                  <StatsCard
                    label="Saved"
                    value={stats.byStatus.saved}
                    icon={<Bookmark className="h-4 w-4 text-amber-400" />}
                    loading={statsLoading}
                  />
                  <StatsCard
                    label="Dismissed"
                    value={stats.byStatus.dismissed}
                    icon={<EyeOff className="h-4 w-4 text-red-400" />}
                    loading={statsLoading}
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
              )}

              {/* Filter Bar */}
              <div className="flex flex-col gap-3 rounded-xl bg-white/5 border border-white/10 p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-white/50 text-sm shrink-0">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                </div>
                <div className="grid grid-cols-2 gap-3 flex-1 sm:grid-cols-4">
                  <Select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="">All Types</option>
                    <option value="profile">Profiles</option>
                    <option value="post">Posts</option>
                    <option value="company">Companies</option>
                    <option value="job">Jobs</option>
                  </Select>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All Status</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="saved">Saved</option>
                    <option value="dismissed">Dismissed</option>
                  </Select>
                  <Select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  >
                    <option value="">All Tags</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </Select>
                  <div className="relative col-span-2 sm:col-span-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <Input
                      placeholder="Search leads..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        setLeadsLoading(true);
                        Promise.all([fetchLeads(), fetchStats()]).finally(() =>
                          setLeadsLoading(false)
                        );
                      }}
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4 text-white/50",
                          leadsLoading && "animate-spin"
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh leads</TooltipContent>
                </Tooltip>
              </div>

              {/* Leads List */}
              {leadsLoading ? (
                <div className="animate-pulse space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-white/5" />
                  ))}
                </div>
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-white/5 p-4 mb-4">
                    <Users className="h-10 w-10 text-white/20" />
                  </div>
                  <p className="text-white/40 text-sm mt-2">No leads found</p>
                  <p className="text-white/25 text-xs mt-1 max-w-sm">
                    {typeFilter || statusFilter || tagFilter || searchQuery
                      ? "Try adjusting your filters to find more leads."
                      : "Leads will appear here once the browser extension scrapes LinkedIn based on your configurations."}
                  </p>
                  {(typeFilter || statusFilter || tagFilter || searchQuery) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => {
                        setTypeFilter("");
                        setStatusFilter("");
                        setTagFilter("");
                        setSearchInput("");
                        setSearchQuery("");
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {leads.map((lead) => {
                    const status = getLeadStatus(lead);
                    return (
                      <div
                        key={lead._id}
                        className={cn(
                          "rounded-xl bg-white/5 border border-white/10 px-4 py-3 transition-colors hover:border-white/20",
                          status === "dismissed" && "opacity-60"
                        )}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          {/* Left: Lead info */}
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="mt-0.5 shrink-0">
                              {getTypeIcon(lead.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-white truncate">
                                  {getLeadDisplayName(lead)}
                                </p>
                                <Badge variant={statusBadgeVariant(status)}>
                                  {status}
                                </Badge>
                                <Badge variant="default">{lead.type}</Badge>
                              </div>
                              {getLeadHeadline(lead) && (
                                <p className="text-xs text-white/40 mt-1 line-clamp-1">
                                  {getLeadHeadline(lead)}
                                </p>
                              )}
                              {/* Tags row */}
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {lead.tags?.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="default"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    <Tag className="h-2.5 w-2.5 mr-0.5" />
                                    {tag}
                                  </Badge>
                                ))}
                                <button
                                  onClick={() => openTagDialog(lead)}
                                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-white/20 px-1.5 py-0.5 text-[10px] text-white/30 hover:text-white/50 hover:border-white/30 transition-colors"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                  tag
                                </button>
                                <span className="text-[10px] text-white/20 ml-1">
                                  {formatRelativeTime(lead.createdAt)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            {lead.source?.url && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={lead.source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Open in LinkedIn</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    actionLoading === `${lead._id}-saved` ||
                                    status === "saved"
                                  }
                                  onClick={() =>
                                    performLeadAction(lead._id, "saved")
                                  }
                                >
                                  {actionLoading === `${lead._id}-saved` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Bookmark
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        status === "saved"
                                          ? "text-amber-400 fill-amber-400"
                                          : "text-white/40"
                                      )}
                                    />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {status === "saved" ? "Already saved" : "Save lead"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    actionLoading ===
                                      `${lead._id}-reached_out` ||
                                    status === "contacted"
                                  }
                                  onClick={() =>
                                    performLeadAction(lead._id, "reached_out")
                                  }
                                >
                                  {actionLoading ===
                                  `${lead._id}-reached_out` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        status === "contacted"
                                          ? "text-green-400"
                                          : "text-white/40"
                                      )}
                                    />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {status === "contacted"
                                  ? "Already contacted"
                                  : "Mark as contacted"}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={
                                    actionLoading ===
                                      `${lead._id}-dismissed` ||
                                    status === "dismissed"
                                  }
                                  onClick={() =>
                                    performLeadAction(lead._id, "dismissed")
                                  }
                                >
                                  {actionLoading ===
                                  `${lead._id}-dismissed` ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <X
                                      className={cn(
                                        "h-3.5 w-3.5",
                                        status === "dismissed"
                                          ? "text-red-400"
                                          : "text-white/40"
                                      )}
                                    />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {status === "dismissed"
                                  ? "Already dismissed"
                                  : "Dismiss lead"}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More */}
                  {hasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1.5" />
                            Load More
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ============================================================= */}
          {/* TAB 3: OUTREACH TEMPLATES                                      */}
          {/* ============================================================= */}
          <TabsContent value="templates">
            <div className="space-y-4">
              {/* Templates header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/50">
                    Create reusable outreach message templates with variable
                    placeholders.
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-white/30">
                      Available variables:
                    </span>
                    {TEMPLATE_VARIABLES.map((v) => (
                      <span
                        key={v}
                        className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[11px] text-blue-400 font-mono"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
                <Button size="sm" onClick={openNewTemplate}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Template
                </Button>
              </div>

              <Separator />

              {/* Templates list */}
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="rounded-full bg-white/5 p-4 mb-4">
                    <MessageSquare className="h-10 w-10 text-white/20" />
                  </div>
                  <p className="text-white/40 text-sm mt-2">
                    No outreach templates yet
                  </p>
                  <p className="text-white/25 text-xs mt-1 max-w-sm">
                    Create templates with variable placeholders to speed up your
                    outreach messages.
                  </p>
                  <Button
                    size="sm"
                    className="mt-4"
                    onClick={openNewTemplate}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create Your First Template
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {templates.map((template) => (
                    <Card
                      key={template._id || template.id}
                      className="hover:border-white/20 transition-colors group"
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="h-4 w-4 text-blue-400 shrink-0" />
                            <h3 className="font-semibold text-white truncate">
                              {template.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => copyTemplate(template.body)}
                                >
                                  <Copy className="h-3.5 w-3.5 text-white/40" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy to clipboard</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditTemplate(template)}
                                >
                                  <Pencil className="h-3.5 w-3.5 text-white/40" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit template</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => deleteTemplate(template._id || template.id || "")}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete template</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="text-xs text-white/50 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                          {highlightVariables(template.body)}
                        </div>
                        <p className="text-[10px] text-white/20 mt-3">
                          Updated {formatRelativeTime(template.updatedAt)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ================================================================= */}
        {/* DIALOGS                                                           */}
        {/* ================================================================= */}

        {/* Add Config Dialog */}
        <AddConfigDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSuccess={fetchConfigs}
        />

        {/* Tag Management Dialog */}
        <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage Tags</DialogTitle>
              <DialogDescription>
                Add or remove tags for{" "}
                <span className="text-white font-medium">
                  {tagDialogLead ? getLeadDisplayName(tagDialogLead) : "this lead"}
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {/* Suggested tags from existing tags */}
              {allTags.length > 0 && (
                <div>
                  <p className="text-xs text-white/30 mb-2">Existing tags:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags
                      .filter((t) => !editingTags.includes(t))
                      .map((tag) => (
                        <Badge
                          key={tag}
                          variant="default"
                          className="cursor-pointer hover:bg-white/20 transition-colors"
                          onClick={() =>
                            setEditingTags((prev) => [...prev, tag])
                          }
                        >
                          <Plus className="h-2.5 w-2.5 mr-0.5" />
                          {tag}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
              {/* Current tags */}
              <div>
                <p className="text-xs text-white/30 mb-2">
                  Current tags ({editingTags.length}):
                </p>
                {editingTags.length === 0 ? (
                  <p className="text-xs text-white/20 italic">No tags added</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {editingTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="info"
                        className="cursor-pointer gap-1"
                        onClick={() => removeTag(tag)}
                      >
                        {tag}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTagDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (tagDialogLead) {
                    updateLeadTags(tagDialogLead._id, editingTags);
                  }
                }}
                disabled={savingTags}
              >
                {savingTags ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  "Save Tags"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Dialog */}
        <Dialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Template" : "New Outreach Template"}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate
                  ? "Update your outreach template. Use variables to personalize messages."
                  : "Create a reusable outreach template. Use variables like {{name}}, {{company}}, and {{headline}} that will be replaced with lead data."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g., Initial Connection Request"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Message Body</Label>
                <Textarea
                  placeholder={`Hi {{name}},\n\nI came across your profile and noticed your work at {{company}}. Your background in {{headline}} really caught my attention.\n\nWould love to connect!`}
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  className="min-h-[160px]"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-white/30">
                    Insert variable:
                  </span>
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] text-blue-400 font-mono hover:bg-blue-500/20 transition-colors"
                      onClick={() =>
                        setTemplateBody((prev) => prev + v)
                      }
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {/* Preview */}
              {templateBody && (
                <div className="space-y-2">
                  <Label className="text-white/50">Preview</Label>
                  <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
                    {highlightVariables(templateBody)}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={saveTemplate}>
                {editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Stats Card sub-component
// ---------------------------------------------------------------------------

function StatsCard({
  label,
  value,
  icon,
  loading,
  className,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3",
        className
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div>
        {loading ? (
          <div className="h-5 w-8 rounded bg-white/10 animate-pulse" />
        ) : (
          <p className="text-lg font-semibold text-white">{value}</p>
        )}
        <p className="text-[11px] text-white/40">{label}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Config Dialog sub-component
// ---------------------------------------------------------------------------

function AddConfigDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ScraperConfigFormValues>({
    resolver: zodResolver(scraperConfigSchema),
    defaultValues: {
      name: "",
      type: "posts",
      keywords: [],
      maxResults: 50,
    },
  });

  const addKeyword = useCallback(() => {
    const trimmed = kwInput.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      const next = [...keywords, trimmed];
      setKeywords(next);
      setValue("keywords", next);
      setKwInput("");
    }
  }, [kwInput, keywords, setValue]);

  const removeKeyword = useCallback(
    (index: number) => {
      const next = keywords.filter((_, i) => i !== index);
      setKeywords(next);
      setValue("keywords", next);
    },
    [keywords, setValue]
  );

  const onSubmit = async (data: ScraperConfigFormValues) => {
    setSaving(true);
    try {
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast.success("Configuration created successfully");
        onOpenChange(false);
        reset();
        setKeywords([]);
        onSuccess();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create configuration");
      }
    } catch {
      toast.error("Network error creating configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Scraper Config</DialogTitle>
          <DialogDescription>
            Configure what to scrape from LinkedIn. The browser extension will
            use this configuration to find leads.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Config Name</Label>
            <Input
              placeholder="e.g., SaaS Founders in NYC"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Scrape Type</Label>
            <Select {...register("type")}>
              <option value="posts">Posts</option>
              <option value="profiles">Profiles</option>
              <option value="companies">Companies</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Keywords</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add keyword and press Enter"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addKeyword}
                disabled={!kwInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {keywords.map((kw, i) => (
                  <Badge
                    key={i}
                    variant="info"
                    className="gap-1 cursor-pointer"
                    onClick={() => removeKeyword(i)}
                  >
                    {kw}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
            {errors.keywords && (
              <p className="text-xs text-red-400">{errors.keywords.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Max Results</Label>
            <Input
              type="number"
              min={1}
              max={100}
              {...register("maxResults", { valueAsNumber: true })}
            />
            {errors.maxResults && (
              <p className="text-xs text-red-400">
                {errors.maxResults.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Creating...
                </>
              ) : (
                "Create Config"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
