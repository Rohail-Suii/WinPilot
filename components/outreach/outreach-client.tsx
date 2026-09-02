"use client";

/**
 * Every hiring post the agent found, and what happened about it.
 *
 * The list is deliberately one list rather than two. A post with an address and
 * a post without one are the same discovery at different stages, and splitting
 * them into separate screens made it impossible to answer "what did the agent
 * find today" in one glance. The filter chips slice it; the counters above say
 * what the slices are.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Mail,
  MailCheck,
  MailX,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Trash2,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type OutreachStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "needs_manual"
  | "needs_review"
  | "skipped";

interface OutreachItem {
  _id: string;
  postKey: string;
  postUrl: string;
  postContent: string;
  authorName?: string;
  authorHeadline?: string;
  company?: string;
  roleTitle?: string;
  confidence: number;
  signals: string[];
  relevanceScore: number;
  matchedSkills: string[];
  channel: "email" | "link" | "none";
  recipientEmail?: string;
  candidateEmails: string[];
  applyLinks: string[];
  status: OutreachStatus;
  subject?: string;
  body?: string;
  attachmentName?: string;
  spamScore?: number;
  spamIssues: string[];
  sentAt?: string;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: string;
  lastError?: string;
  handledAt?: string;
  createdAt: string;
}

interface SenderState {
  enabled: boolean;
  gmailUser: string;
  credentialSource: "user" | "env" | "none";
  dailyLimit: number;
  sentToday: number;
  canSendNow: boolean;
  pacingReason?: string;
}

// ─── Status presentation ────────────────────────────────────────────────────

const STATUS_META: Record<
  OutreachStatus,
  { label: string; className: string; icon: typeof Mail }
> = {
  sent: {
    label: "Emailed",
    className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: MailCheck,
  },
  queued: {
    label: "Queued",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Clock,
  },
  sending: {
    label: "Sending",
    className: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Loader2,
  },
  needs_review: {
    label: "Needs your OK",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: AlertTriangle,
  },
  needs_manual: {
    label: "Apply by hand",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    icon: Link2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: MailX,
  },
  skipped: {
    label: "Not applied",
    className: "bg-white/5 text-white/40 border-white/10",
    icon: X,
  },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Everything" },
  { key: "sent", label: "Emailed" },
  { key: "queued", label: "Queued" },
  { key: "needs_review", label: "Needs your OK" },
  { key: "needs_manual", label: "Apply by hand" },
  { key: "failed", label: "Failed" },
  { key: "skipped", label: "Not applied" },
];

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function titleOf(item: OutreachItem): string {
  const parts = [item.roleTitle, item.company].filter(Boolean);
  if (parts.length === 2) return `${parts[0]} at ${parts[1]}`;
  return parts[0] || item.authorName || "A hiring post";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OutreachClient() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [sender, setSender] = useState<SenderState | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "", recipientEmail: "" });

  const load = useCallback(async () => {
    try {
      const query = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/outreach${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load your outreach");
      setItems(data.items || []);
      setByStatus(data.byStatus || {});
      setSender(data.sender || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  // A queued application is sent by a background worker, so the page has to
  // come back to the server to notice. Only while something is actually in
  // flight — polling an idle queue is noise.
  const hasPending = useMemo(
    () => items.some((i) => i.status === "queued" || i.status === "sending"),
    [items]
  );

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  const act = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "That did not work");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  };

  const send = async (id: string, regenerate = false) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "send", regenerate }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.reason || "Send failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  };

  const writeDraft = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "draft" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not write the email");
      setItems((prev) =>
        prev.map((i) =>
          i._id === id
            ? { ...i, subject: data.subject, body: data.body, spamIssues: data.spamIssues || [] }
            : i
        )
      );
      setExpanded(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this from the list? The agent may find the post again later.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/outreach?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      setItems((prev) => prev.filter((i) => i._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  };

  const startEditing = (item: OutreachItem) => {
    setEditing(item._id);
    setExpanded(item._id);
    setDraft({
      subject: item.subject || "",
      body: item.body || "",
      recipientEmail: item.recipientEmail || "",
    });
  };

  const saveEdit = async (id: string) => {
    await act(id, "edit", draft);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-400" />
            Job Applications
          </h1>
          <p className="text-sm text-white/50 mt-1 max-w-2xl">
            Hiring posts the agent read on your feed. Ones with an email address get an
            application sent from your Gmail with your resume attached. Ones without get saved
            here with their link, for you to apply to by hand.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {sender && <SenderBanner sender={sender} />}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Emailed" value={byStatus.sent || 0} tone="emerald" />
        <Stat label="Queued" value={(byStatus.queued || 0) + (byStatus.sending || 0)} tone="blue" />
        <Stat label="Apply by hand" value={byStatus.needs_manual || 0} tone="violet" />
        <Stat label="Needs your OK" value={byStatus.needs_review || 0} tone="amber" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              filter === f.key
                ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                : "bg-white/[0.03] text-white/50 border-white/10 hover:text-white/80"
            )}
          >
            {f.label}
            {f.key && byStatus[f.key] ? (
              <span className="ml-1.5 text-white/30">{byStatus[f.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-white/40">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="w-8 h-8 mx-auto text-white/20 mb-3" />
          <p className="text-white/60 text-sm">
            Nothing here yet. The agent records a hiring post the moment it reads one on your
            feed — leave Autopilot running in feed mode.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <OutreachRow
              key={item._id}
              item={item}
              busy={busyId === item._id}
              expanded={expanded === item._id}
              editing={editing === item._id}
              draft={draft}
              onToggle={() => setExpanded(expanded === item._id ? null : item._id)}
              onDraftChange={setDraft}
              onStartEdit={() => startEditing(item)}
              onCancelEdit={() => setEditing(null)}
              onSaveEdit={() => saveEdit(item._id)}
              onWriteDraft={() => writeDraft(item._id)}
              onSend={(regenerate) => send(item._id, regenerate)}
              onAct={(action) => act(item._id, action)}
              onDelete={() => remove(item._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
  };
  return (
    <Card className="p-4">
      <p className={cn("text-2xl font-semibold", tones[tone])}>{value}</p>
      <p className="text-xs text-white/40 mt-0.5">{label}</p>
    </Card>
  );
}

function SenderBanner({ sender }: { sender: SenderState }) {
  if (!sender.enabled) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Email sending is off, so hiring posts are being recorded but nothing is going out.
          Connect a Gmail account and turn sending on in{" "}
          <a href="/dashboard/settings" className="underline">
            Settings
          </a>
          .
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/50">
      <span className="text-white/70">
        Sending as <span className="text-white">{sender.gmailUser}</span>
        {sender.credentialSource === "env" && (
          <span className="text-white/40"> (from the server environment)</span>
        )}
      </span>
      <span>
        {sender.sentToday} of {sender.dailyLimit} sent in the last 24h
      </span>
      {!sender.canSendNow && sender.pacingReason && (
        <span className="text-amber-300/80">{sender.pacingReason}</span>
      )}
    </div>
  );
}

interface RowProps {
  item: OutreachItem;
  busy: boolean;
  expanded: boolean;
  editing: boolean;
  draft: { subject: string; body: string; recipientEmail: string };
  onToggle: () => void;
  onDraftChange: (d: { subject: string; body: string; recipientEmail: string }) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onWriteDraft: () => void;
  onSend: (regenerate?: boolean) => void;
  onAct: (action: string) => void;
  onDelete: () => void;
}

function OutreachRow({
  item,
  busy,
  expanded,
  editing,
  draft,
  onToggle,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onWriteDraft,
  onSend,
  onAct,
  onDelete,
}: RowProps) {
  const meta = STATUS_META[item.status];
  const Icon = meta.icon;
  const canSend = item.status === "needs_review" || item.status === "failed" || item.status === "queued";

  return (
    <Card className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-white truncate">{titleOf(item)}</h3>
              <Badge className={cn("text-[10px] border", meta.className)}>
                <Icon className={cn("w-3 h-3 mr-1", item.status === "sending" && "animate-spin")} />
                {meta.label}
              </Badge>
              {item.handledAt && (
                <Badge className="text-[10px] border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  <Check className="w-3 h-3 mr-1" />
                  Handled
                </Badge>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
              {item.authorName && <span>Posted by {item.authorName}</span>}
              {item.recipientEmail && (
                <span className="text-white/60">{item.recipientEmail}</span>
              )}
              <span>{timeAgo(item.createdAt)}</span>
              {item.sentAt && <span className="text-emerald-400/70">sent {timeAgo(item.sentAt)}</span>}
            </div>
          </div>

          <button
            onClick={onToggle}
            className="shrink-0 text-white/40 hover:text-white/70 transition-colors"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {item.lastError && (
          <p className="mt-2 text-xs text-amber-300/80 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
            {item.lastError}
          </p>
        )}

        {/* The whole point of the "no email" half: the links, right there. */}
        {item.status === "needs_manual" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.applyLinks.map((link) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/25 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-200 hover:bg-violet-500/15"
              >
                <Link2 className="w-3.5 h-3.5" />
                {new URL(link).hostname.replace(/^www\./, "")}
              </a>
            ))}
            {item.postUrl?.startsWith("http") && (
              <a
                href={item.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open the post
              </a>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canSend && item.recipientEmail && (
            <Button size="sm" onClick={() => onSend(false)} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
              {item.status === "failed" ? "Retry" : "Send now"}
            </Button>
          )}
          {item.status === "needs_review" && item.recipientEmail && !item.subject && (
            <Button size="sm" variant="outline" onClick={onWriteDraft} disabled={busy}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Write the email
            </Button>
          )}
          {item.status !== "sent" && item.subject && (
            <Button size="sm" variant="outline" onClick={onStartEdit} disabled={busy}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Edit
            </Button>
          )}
          {item.status === "needs_manual" && !item.handledAt && (
            <Button size="sm" variant="outline" onClick={() => onAct("mark_handled")} disabled={busy}>
              <Check className="w-3.5 h-3.5 mr-1.5" />
              I applied
            </Button>
          )}
          {item.status !== "skipped" && item.status !== "sent" && (
            <Button size="sm" variant="ghost" onClick={() => onAct("dismiss")} disabled={busy}>
              <X className="w-3.5 h-3.5 mr-1.5" />
              Dismiss
            </Button>
          )}
          {item.status === "skipped" && (
            <Button size="sm" variant="ghost" onClick={() => onAct("reopen")} disabled={busy}>
              Reopen
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 bg-black/20 p-4 space-y-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40">To</label>
                <Input
                  value={draft.recipientEmail}
                  onChange={(e) => onDraftChange({ ...draft, recipientEmail: e.target.value })}
                  placeholder="hr@company.com"
                />
              </div>
              <div>
                <label className="text-xs text-white/40">Subject</label>
                <Input
                  value={draft.subject}
                  onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-white/40">Body</label>
                <Textarea
                  rows={12}
                  value={draft.body}
                  onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={onSaveEdit} disabled={busy}>
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                  Cancel
                </Button>
                <Button size="sm" variant="outline" onClick={onWriteDraft} disabled={busy}>
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} />
                  Rewrite with AI
                </Button>
              </div>
            </div>
          ) : (
            <>
              {item.subject && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/30 mb-1">
                    {item.status === "sent" ? "What was sent" : "Draft"}
                  </p>
                  <p className="text-sm text-white font-medium">{item.subject}</p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-white/70 leading-relaxed">
                    {item.body}
                  </pre>
                  {item.attachmentName && (
                    <p className="mt-2 text-xs text-white/40">
                      Attached: {item.attachmentName}
                    </p>
                  )}
                  {item.spamIssues.length > 0 && (
                    <p className="mt-2 text-xs text-amber-300/70">
                      Deliverability notes: {item.spamIssues.join("; ")}
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wide text-white/30 mb-1">The post</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-white/50 leading-relaxed max-h-64 overflow-y-auto">
                  {item.postContent}
                </pre>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/35">
                <span>Read as a job post with {Math.round(item.confidence * 100)}% confidence</span>
                {item.signals.length > 0 && <span>Because it {item.signals.join(", ")}</span>}
                {item.matchedSkills.length > 0 && (
                  <span className="text-emerald-400/60">
                    Asks for {item.matchedSkills.join(", ")}
                  </span>
                )}
                {item.candidateEmails.length > 1 && (
                  <span>Other addresses on the post: {item.candidateEmails.slice(1).join(", ")}</span>
                )}
                {item.attempts > 0 && (
                  <span>
                    {item.attempts} of {item.maxAttempts} attempts used
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
