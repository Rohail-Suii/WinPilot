"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Target,
  Plus,
  Trash2,
  Play,
  Square,
  Edit2,
  Check,
  X,
  MessageSquare,
  Search,
  Zap,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useExtensionStore } from "@/lib/hooks/use-stores";
import { WifiOff } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Campaign {
  _id: string;
  name: string;
  keywords: string[];
  commentTemplates: string[];
  serviceDescription: string;
  targetAudience: string;
  useAI: boolean;
  status: "active" | "paused" | "stopped";
  dailyCommentLimit: number;
  postsPerKeyword: number;
  stats: {
    totalCommented: number;
    totalFound: number;
    lastRun?: string;
  };
  recentComments: {
    postUrl: string;
    postAuthor: string;
    comment: string;
    keyword: string;
    commentedAt: string;
  }[];
  createdAt: string;
}

interface LogEntry {
  id: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
  timestamp: Date;
  keyword?: string;
}

// ─── Empty campaign form ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  keywords: [""],
  commentTemplates: ["Hey {firstName}, I saw your post and I can help! I build custom websites — feel free to reach out."],
  serviceDescription: "",
  targetAudience: "",
  useAI: true,
  dailyCommentLimit: 10,
  postsPerKeyword: 5,
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function LeadGenClient() {
  const extensionConnected = useExtensionStore((s) => s.isConnected);
  const leadGenLogs = useExtensionStore((s) => s.leadGenLogs);
  const leadGenRunning = useExtensionStore((s) => s.leadGenRunning);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [commentsToday, setCommentsToday] = useState(0);
  const [commentLimit, setCommentLimit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // ─── Fetch campaigns ─────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/lead-gen");
      if (!res.ok) throw new Error(`Failed to load campaigns (${res.status})`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setCommentsToday(data.commentsToday ?? 0);
      setCommentLimit(data.commentLimit ?? 15);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // ─── Sync runningCampaignId when WS store marks lead gen done ─────────────────

  useEffect(() => {
    if (!leadGenRunning && runningCampaignId) {
      setRunningCampaignId(null);
      fetchCampaigns();
    }
  }, [leadGenRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [leadGenLogs]);

  // ─── Create campaign ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    const keywords = form.keywords.filter((k) => k.trim());
    const commentTemplates = form.commentTemplates.filter((t) => t.trim());

    if (!form.name.trim()) return setError("Campaign name is required");
    if (keywords.length === 0) return setError("At least one keyword is required");
    if (commentTemplates.length === 0) return setError("At least one comment template is required");

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/lead-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, keywords, commentTemplates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      setCampaigns((prev) => [data.campaign, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Update campaign ──────────────────────────────────────────────────────────

  const handleUpdate = async (id: string) => {
    const keywords = editForm.keywords.filter((k) => k.trim());
    const commentTemplates = editForm.commentTemplates.filter((t) => t.trim());

    if (!editForm.name.trim()) return setError("Name is required");
    if (keywords.length === 0) return setError("At least one keyword is required");

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/lead-gen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm, keywords, commentTemplates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setCampaigns((prev) =>
        prev.map((c) => (c._id === id ? data.campaign : c))
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Toggle campaign status ───────────────────────────────────────────────────

  const toggleStatus = async (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/lead-gen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign._id, status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCampaigns((prev) =>
        prev.map((c) => (c._id === campaign._id ? data.campaign : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  // ─── Delete campaign ──────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/lead-gen?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setCampaigns((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  // ─── Start / Stop automation via extension ────────────────────────────────────

  const startLeadGen = (campaignId: string) => {
    setRunningCampaignId(campaignId);
    useExtensionStore.getState().clearLeadGenLogs();
    useExtensionStore.getState().setLeadGenRunning(true);
    // Send message to the extension service worker
    window.postMessage(
      { type: "START_LEAD_GEN_REQUEST", campaignId },
      "*"
    );
  };

  const stopLeadGen = () => {
    window.postMessage({ type: "STOP_LEAD_GEN_REQUEST" }, "*");
    setRunningCampaignId(null);
    useExtensionStore.getState().setLeadGenRunning(false);
  };

  const _addLog = (level: LogEntry["level"], message: string, keyword?: string) => {
    useExtensionStore.getState().addLeadGenLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      source: "system",
      message,
      details: keyword,
    });
  };

  // ─── Dynamic form helpers ──────────────────────────────────────────────────────

  const _updateKeyword = (
    arr: string[],
    setArr: (v: string[]) => void,
    idx: number,
    val: string
  ) => {
    const next = [...arr];
    next[idx] = val;
    setArr(next);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="h-6 w-6 text-[#00E5FF]" />
            Lead Generation
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Search LinkedIn posts by keyword and auto-comment to attract clients
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/20"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {/* ── Extension offline banner ── */}
      {!extensionConnected && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          Extension is offline. Connect the LinkedIn extension to start automation.
        </div>
      )}

      {/* ── Daily usage bar ── */}
      <Card className="bg-[#111] border-[#1A1A1A] p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Comments today</span>
          <span className="text-sm font-medium text-white">
            {commentsToday} / {commentLimit}
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00E5FF] rounded-full transition-all"
            style={{ width: `${Math.min(100, (commentsToday / commentLimit) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-white/30 mt-1">
          Safe daily limit: {commentLimit} comments. Resets at midnight.
        </p>
      </Card>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Create campaign form ── */}
      {showCreate && (
        <CampaignForm
          form={form}
          setForm={setForm}
          onSave={handleCreate}
          onCancel={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
          saving={saving}
          title="New Campaign"
        />
      )}

      {/* ── Campaign list ── */}
      {campaigns.length === 0 && !showCreate ? (
        <div className="text-center py-16 text-white/30">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="text-sm mt-1">Create a campaign to start finding leads on LinkedIn</p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign._id}
              campaign={campaign}
              isRunning={runningCampaignId === campaign._id}
              latestLog={runningCampaignId === campaign._id && leadGenLogs.length > 0 ? leadGenLogs[leadGenLogs.length - 1] : null}
              isEditing={editingId === campaign._id}
              editForm={editForm}
              setEditForm={setEditForm}
              isExpanded={expandedCampaign === campaign._id}
              onToggleExpand={() =>
                setExpandedCampaign(expandedCampaign === campaign._id ? null : campaign._id)
              }
              onEdit={() => {
                setEditingId(campaign._id);
                setEditForm({
                  name: campaign.name,
                  keywords: campaign.keywords,
                  commentTemplates: campaign.commentTemplates,
                  serviceDescription: campaign.serviceDescription,
                  targetAudience: campaign.targetAudience,
                  useAI: campaign.useAI,
                  dailyCommentLimit: campaign.dailyCommentLimit,
                  postsPerKeyword: campaign.postsPerKeyword,
                });
              }}
              onSaveEdit={() => handleUpdate(campaign._id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => handleDelete(campaign._id)}
              onToggleStatus={() => toggleStatus(campaign)}
              extensionConnected={extensionConnected}
              onStart={() => startLeadGen(campaign._id)}
              onStop={stopLeadGen}
              saving={saving}
            />
          ))}
        </div>
      )}

      {/* ── Live activity log ── */}
      {leadGenLogs.length > 0 && (
        <Card className="bg-[#0A0A0A] border-[#1A1A1A] p-4">
          <h3 className="text-sm font-medium text-white/70 mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#00E5FF]" />
            Live Activity
          </h3>
          <div className="space-y-1 max-h-56 overflow-y-auto font-mono text-xs">
            {leadGenLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex gap-2",
                  log.level === "success" && "text-green-400",
                  log.level === "error" && "text-red-400",
                  log.level === "warn" && "text-yellow-400",
                  log.level === "info" && "text-white/50"
                )}
              >
                <span className="text-white/20 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Campaign Form Component ────────────────────────────────────────────────────

interface CampaignFormProps {
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}

function CampaignForm({ form, setForm, onSave, onCancel, saving, title }: CampaignFormProps) {
  const setKeyword = (idx: number, val: string) => {
    const kw = [...form.keywords];
    kw[idx] = val;
    setForm({ ...form, keywords: kw });
  };

  const setTemplate = (idx: number, val: string) => {
    const t = [...form.commentTemplates];
    t[idx] = val;
    setForm({ ...form, commentTemplates: t });
  };

  return (
    <Card className="bg-[#111] border-[#1A1A1A] p-5 space-y-4">
      <h3 className="text-base font-semibold text-white">{title}</h3>

      {/* Name */}
      <div>
        <label className="text-xs text-white/50 mb-1 block">Campaign Name *</label>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Website Leads"
          className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
        />
      </div>

      {/* Keywords */}
      <div>
        <label className="text-xs text-white/50 mb-1 block">
          Search Keywords *
          <span className="text-white/30 ml-1">(what people post about that signals they need your service)</span>
        </label>
        <div className="space-y-2">
          {form.keywords.map((kw, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={kw}
                onChange={(e) => setKeyword(i, e.target.value)}
                placeholder="e.g. need a website now"
                className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
              />
              {form.keywords.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm({ ...form, keywords: form.keywords.filter((_, j) => j !== i) })
                  }
                  className="text-red-400 hover:text-red-300 px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {form.keywords.length < 10 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setForm({ ...form, keywords: [...form.keywords, ""] })}
              className="text-[#00E5FF]/70 hover:text-[#00E5FF] text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add keyword
            </Button>
          )}
        </div>
        {/* Keyword tips */}
        <div className="mt-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-md">
          <p className="text-xs text-yellow-400/80 font-medium mb-1">💡 Tips for finding real clients (not competitors):</p>
          <ul className="text-xs text-white/40 space-y-0.5 list-disc list-inside">
            <li>Use phrases that signal <em>need</em>: <span className="text-white/60">&ldquo;looking for web developer&rdquo;</span>, <span className="text-white/60">&ldquo;anyone recommend a website builder&rdquo;</span></li>
            <li>Target pain points: <span className="text-white/60">&ldquo;my website is broken&rdquo;</span>, <span className="text-white/60">&ldquo;need to redesign my website&rdquo;</span>, <span className="text-white/60">&ldquo;no website for my business&rdquo;</span></li>
            <li>Business owner intent: <span className="text-white/60">&ldquo;want to get my business online&rdquo;</span>, <span className="text-white/60">&ldquo;starting a small business website&rdquo;</span></li>
            <li>Avoid single broad terms like <span className="text-white/60">&ldquo;website&rdquo;</span> — too many service providers will show up.</li>
          </ul>
          <p className="text-xs text-white/30 mt-1.5">AI will also automatically filter out service providers from results when AI mode is on.</p>
        </div>
      </div>

      {/* Comment templates */}
      <div>
        <label className="text-xs text-white/50 mb-1 block">
          Comment Templates *
          <span className="text-white/30 ml-1">(use {"{firstName}"} or {"{authorName}"} as placeholders)</span>
        </label>
        <div className="space-y-2">
          {form.commentTemplates.map((tpl, i) => (
            <div key={i} className="flex gap-2">
              <textarea
                value={tpl}
                onChange={(e) => setTemplate(i, e.target.value)}
                placeholder="Hey {firstName}, I saw your post and I can help! I build custom websites — feel free to reach out."
                rows={2}
                className="flex-1 bg-[#0A0A0A] border border-[#2A2A2A] rounded-md text-white text-sm p-2 resize-none outline-none focus:border-[#00E5FF]/40"
              />
              {form.commentTemplates.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      commentTemplates: form.commentTemplates.filter((_, j) => j !== i),
                    })
                  }
                  className="text-red-400 hover:text-red-300 px-2"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {form.commentTemplates.length < 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm({ ...form, commentTemplates: [...form.commentTemplates, ""] })
              }
              className="text-[#00E5FF]/70 hover:text-[#00E5FF] text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add template
            </Button>
          )}
        </div>
      </div>

      {/* Service description (for AI) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-white/50 mb-1 block">
            Your Service <span className="text-white/30">(for AI context)</span>
          </label>
          <Input
            value={form.serviceDescription}
            onChange={(e) => setForm({ ...form, serviceDescription: e.target.value })}
            placeholder="e.g. I build custom websites for small businesses"
            className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Target Audience</label>
          <Input
            value={form.targetAudience}
            onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
            placeholder="e.g. small business owners"
            className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
          />
        </div>
      </div>

      {/* Limits & AI toggle */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-white/50 mb-1 block">Daily Limit</label>
          <Input
            type="number"
            min={1}
            max={500}
            value={form.dailyCommentLimit}
            onChange={(e) =>
              setForm({ ...form, dailyCommentLimit: Math.min(500, Math.max(1, parseInt(e.target.value) || 10)) })
            }
            className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
          />
        </div>
        <div>
          <label className="text-xs text-white/50 mb-1 block">Posts per Keyword</label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.postsPerKeyword}
            onChange={(e) =>
              setForm({ ...form, postsPerKeyword: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)) })
            }
            className="bg-[#0A0A0A] border-[#2A2A2A] text-white"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer pb-1">
            <div
              onClick={() => setForm({ ...form, useAI: !form.useAI })}
              className={cn(
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                form.useAI ? "bg-[#00E5FF]" : "bg-white/10"
              )}
            >
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                  form.useAI ? "translate-x-4.5" : "translate-x-0.5"
                )}
              />
            </div>
            <span className="text-xs text-white/50">Use AI</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-[#00E5FF]/10 border border-[#00E5FF]/30 text-[#00E5FF] hover:bg-[#00E5FF]/20"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-[#00E5FF]/30 border-t-[#00E5FF] rounded-full animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel} className="text-white/50 hover:text-white">
          Cancel
        </Button>
      </div>
    </Card>
  );
}

// ─── Campaign Card Component ────────────────────────────────────────────────────

interface CampaignCardProps {
  campaign: Campaign;
  isRunning: boolean;
  latestLog: { level: string; message: string } | null;
  isEditing: boolean;
  editForm: typeof EMPTY_FORM;
  setEditForm: (f: typeof EMPTY_FORM) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
  onStart: () => void;
  onStop: () => void;
  saving: boolean;
  extensionConnected: boolean;
}

function CampaignCard({
  campaign,
  isRunning,
  latestLog,
  isEditing,
  editForm,
  setEditForm,
  isExpanded,
  onToggleExpand,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleStatus,
  onStart,
  onStop,
  saving,
  extensionConnected,
}: CampaignCardProps) {
  const statusColors = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    stopped: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <Card className="bg-[#111] border-[#1A1A1A] overflow-hidden">
      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-semibold text-white truncate">
                {campaign.name}
              </h3>
              <Badge
                className={cn("text-xs border", statusColors[campaign.status])}
              >
                {campaign.status}
              </Badge>
              {isRunning && (
                <Badge className="text-xs bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/30 animate-pulse">
                  Running
                </Badge>
              )}
            </div>
            {/* Live status line while running */}
            {isRunning && latestLog && (
              <div className={cn(
                "mt-1.5 text-xs flex items-center gap-1.5 font-mono",
                latestLog.level === "warn" && "text-yellow-400",
                latestLog.level === "success" && "text-green-400",
                latestLog.level === "error" && "text-red-400",
                latestLog.level === "info" && "text-white/40",
              )}>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />
                <span className="truncate">{latestLog.message}</span>
              </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Search className="h-3 w-3" />
                {campaign.keywords.length} keyword{campaign.keywords.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {campaign.stats.totalCommented} commented
              </span>
              {campaign.stats.lastRun && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last run: {new Date(campaign.stats.lastRun).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {isRunning ? (
              <Button
                size="sm"
                onClick={onStop}
                className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 h-8 px-3 text-xs"
              >
                <Square className="h-3 w-3 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onStart}
                disabled={campaign.status !== "active" || !extensionConnected}
                className="bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 h-8 px-3 text-xs disabled:opacity-40"
                title={
                  !extensionConnected
                    ? "Extension is offline — connect the extension first"
                    : campaign.status !== "active"
                    ? "Set campaign to Active first"
                    : "Start automation"
                }
              >
                {extensionConnected ? <Play className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                Run
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleStatus}
              className="h-8 px-2 text-white/40 hover:text-white"
              title={campaign.status === "active" ? "Pause campaign" : "Activate campaign"}
            >
              {campaign.status === "active" ? "Pause" : "Activate"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="h-8 px-2 text-white/40 hover:text-white"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-8 px-2 text-white/40 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleExpand}
              className="h-8 px-2 text-white/40 hover:text-white"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Keywords pills */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {campaign.keywords.map((kw) => (
            <span
              key={kw}
              className="text-xs bg-[#00E5FF]/5 border border-[#00E5FF]/20 text-[#00E5FF]/70 rounded px-2 py-0.5"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {/* Expanded: recent comments */}
      {isExpanded && campaign.recentComments?.length > 0 && (
        <div className="border-t border-[#1A1A1A] px-4 py-3 bg-black/20">
          <h4 className="text-xs font-medium text-white/50 mb-2">Recent Comments</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...campaign.recentComments].reverse().map((c, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="flex items-center gap-2 text-white/30">
                  <span>{c.postAuthor || "Unknown"}</span>
                  <span>·</span>
                  <span className="text-[#00E5FF]/50">&ldquo;{c.keyword}&rdquo;</span>
                  <span>·</span>
                  <span>{new Date(c.commentedAt).toLocaleDateString()}</span>
                </div>
                <p className="text-white/60 leading-relaxed">{c.comment}</p>
                <a
                  href={c.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#00E5FF]/40 hover:text-[#00E5FF] underline"
                >
                  View post ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit form (inline) */}
      {isEditing && (
        <div className="border-t border-[#1A1A1A] p-4 bg-black/20">
          <CampaignForm
            form={editForm}
            setForm={setEditForm}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            saving={saving}
            title="Edit Campaign"
          />
        </div>
      )}
    </Card>
  );
}
