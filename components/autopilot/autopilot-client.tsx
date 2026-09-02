"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot,
  Play,
  Square,
  RefreshCw,
  Target,
  BookOpen,
  Brain,
  Sparkles,
  AlertTriangle,
  WifiOff,
  Clock,
  Download,
  ListChecks,
  Rss,
  Briefcase,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JournalEntry {
  _id?: string;
  id?: string;
  entryType: "decision" | "action" | "observation" | "error" | "reflection";
  phase: string;
  text: string;
  createdAt: string;
}

interface Memory {
  _id: string;
  kind: string;
  statement: string;
  confidence: number;
  hitCount: number;
}

interface QueuedTask {
  _id: string;
  kind: string;
  state: string;
  scheduledFor: string;
  rationale: string;
}

interface Cycle {
  _id: string;
  weekNumber: number;
  startsAt: string;
  endsAt: string;
  strategy: string;
  channelMix: { prospecting: number; content: number; engagement: number; inbox: number };
  targets: { metric: string; planned: number }[];
  actuals: { metric: string; achieved: number }[];
  status: string;
  reviewSummary?: string;
  strategyDelta?: string;
  score?: number;
}

interface Goal {
  northStar: string;
  successMetric: { kind: string; target: number; by?: string };
  subGoals: { text: string; metric: string; target: number; status: string }[];
  constraints: {
    niche: string[];
    targetRoles: string[];
    targetCompanySizeMin: number;
    targetCompanySizeMax: number;
    geographies: string[];
  };
}

type AutopilotMode = "feed" | "strategist";

interface FeedSettings {
  commentRatio: number;
  pitchOnJobPosts: boolean;
  postsPerSweep: number;
  postsPerPass: number;
}

interface WorkingHours {
  start: number;
  end: number;
  timezone: string;
  activeDays: number[];
}

interface AutopilotState {
  config: {
    enabled: boolean;
    mode: AutopilotMode;
    mission: string;
    feed: FeedSettings;
    workingHours: WorkingHours;
    weeklyBudgets: Record<string, number>;
    pausedUntil?: string;
    pauseReason?: string;
    lastTickAt?: string;
    rampFactor: number;
  };
  status: {
    paused: boolean;
    withinWorkingHours: boolean;
    nextWindowStart: string;
    extensionConnected: boolean;
    scheduler: { running: boolean; tickCount: number; intervalMs: number };
  };
  goal: Goal | null;
  cycle: Cycle | null;
  queue: QueuedTask[];
  journal: JournalEntry[];
  memories: Memory[];
  funnel: Record<string, number>;
}

const ENTRY_STYLES: Record<string, { dot: string; label: string }> = {
  decision: { dot: "bg-indigo-400", label: "text-indigo-300" },
  action: { dot: "bg-emerald-400", label: "text-emerald-300" },
  observation: { dot: "bg-sky-400", label: "text-sky-300" },
  error: { dot: "bg-red-400", label: "text-red-300" },
  reflection: { dot: "bg-amber-400", label: "text-amber-300" },
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Component ─────────────────────────────────────────────────────────────────

export function AutopilotClient() {
  const [state, setState] = useState<AutopilotState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mission, setMission] = useState("");
  const [hours, setHours] = useState<WorkingHours>({
    start: 9,
    end: 21,
    timezone: "Asia/Karachi",
    activeDays: [1, 2, 3, 4, 5],
  });
  const [savedHours, setSavedHours] = useState<WorkingHours | null>(null);
  const [feed, setFeed] = useState<FeedSettings>({
    commentRatio: 0.7,
    pitchOnJobPosts: true,
    postsPerSweep: 25,
    postsPerPass: 5,
  });
  const [savedFeed, setSavedFeed] = useState<FeedSettings | null>(null);
  const [liveEntries, setLiveEntries] = useState<JournalEntry[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch("/api/autopilot");
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const data: AutopilotState = await res.json();
      setState(data);
      setMission((current) => (current ? current : data.config.mission));
      setHours(data.config.workingHours);
      setSavedHours(data.config.workingHours);
      // A config document written before feed mode existed has no `feed` path.
      const feedSettings = data.config.feed ?? {
        commentRatio: 0.7,
        pitchOnJobPosts: true,
        postsPerSweep: 25,
        postsPerPass: 5,
      };
      setFeed(feedSettings);
      setSavedFeed(feedSettings);
      setLiveEntries([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live journal — the document writes itself while you watch it.
  useEffect(() => {
    const es = new EventSource("/api/sse");
    sseRef.current = es;

    es.addEventListener("autopilot:journal", (e) => {
      const entry = JSON.parse((e as MessageEvent).data) as JournalEntry;
      setLiveEntries((prev) => [entry, ...prev].slice(0, 200));
    });

    es.addEventListener("autopilot:paused", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { reason: string };
      toast.warning(`Autopilot paused: ${data.reason}`);
      load(true);
    });

    es.addEventListener("autopilot:cycle", () => load(true));

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [load]);

  const act = async (action: string, successMessage: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      toast.success(successMessage);
      await load(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** PATCH the config and reload. Every settings control routes through here. */
  const patchConfig = async (
    body: Record<string, unknown>,
    successMessage: string
  ): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      toast.success(successMessage);
      await load(true);
      return data;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: AutopilotMode) =>
    patchConfig(
      { mode: next },
      next === "feed"
        ? "Feed mode on. The agent reads your feed and responds to it."
        : "Strategist mode on. Set a mission, then Replan."
    );

  const saveFeed = () => patchConfig({ feed }, "Feed settings saved.");

  const saveMission = async () => {
    const data = await patchConfig({ mission }, "Mission saved.");
    if (data?.missionChanged && state?.config.mode === "strategist") {
      toast.info("Hit Replan to rebuild the goal around it.");
    }
  };

  const saveHours = async () => {
    if (hours.end <= hours.start) {
      toast.error("End hour must be after start hour.");
      return;
    }
    if (hours.activeDays.length === 0) {
      toast.error("Pick at least one active day, or the agent can never run.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workingHours: hours }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      toast.success("Schedule saved.");
      await load(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!state) {
    return (
      <Card className="p-6 text-center text-gray-400">
        Could not load autopilot.{" "}
        <button className="underline" onClick={() => load()}>
          Try again
        </button>
      </Card>
    );
  }

  const { config, status, goal, cycle, queue, memories, funnel } = state;
  const journal = [...liveEntries, ...state.journal];
  const hoursDirty =
    savedHours !== null && JSON.stringify(hours) !== JSON.stringify(savedHours);
  const feedDirty =
    savedFeed !== null && JSON.stringify(feed) !== JSON.stringify(savedFeed);
  const feedMode = config.mode === "feed";

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2.5 rounded-xl",
              config.enabled
                ? "bg-gradient-to-br from-cyan-500/20 to-indigo-500/20"
                : "bg-gray-800"
            )}
          >
            <Bot
              className={cn("h-6 w-6", config.enabled ? "text-cyan-400" : "text-gray-500")}
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Autopilot</h1>
            <p className="text-sm text-gray-400">
              {config.enabled
                ? feedMode
                  ? `Working your feed · ${Math.round(config.rampFactor * 100)}% of budget`
                  : `Running · week ${cycle?.weekNumber ?? 1} · ${Math.round(config.rampFactor * 100)}% of budget`
                : "Stopped"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          {!feedMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => act("replan", "Replanned this week")}
              disabled={busy || !config.enabled}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Replan
            </Button>
          )}
          {config.enabled ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => act("stop", "Autopilot stopped")}
              disabled={busy}
            >
              <Square className="h-4 w-4 mr-1.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => act("start", "Autopilot started")} disabled={busy}>
              <Play className="h-4 w-4 mr-1.5" />
              Start
            </Button>
          )}
        </div>
      </div>

      {/* ── Mode ───────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-gray-300">How it works</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
              {feedMode
                ? "It reads down your LinkedIn feed, opens each post it picks, and spends real time on it before doing anything. It likes what is worth liking and comments where it has something concrete to add. Hiring posts get a pitch built from your actual projects. Anything it has nothing real to say about, it skips."
                : "It turns your mission into a goal, plans the week around it, searches for posts matching your niche, and reviews itself every seven days."}
            </p>
          </div>

          <div className="flex rounded-lg bg-gray-900/70 p-1 shrink-0">
            {(
              [
                ["feed", "Feed", Rss],
                ["strategist", "Strategist", Target],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                disabled={busy || config.mode === value}
                onClick={() => switchMode(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                  config.mode === value
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200 disabled:opacity-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Status banners ─────────────────────────────────────── */}
      {status.paused && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">Paused for safety</p>
              <p className="text-sm text-gray-400 mt-0.5">
                {config.pauseReason || "Autopilot is paused."} Resuming automatically at{" "}
                {new Date(config.pausedUntil!).toLocaleString()}.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => act("resume", "Resumed")}
              disabled={busy}
            >
              Resume now
            </Button>
          </div>
        </Card>
      )}

      {config.enabled && !status.extensionConnected && (
        <Card className="p-4 border-orange-500/40 bg-orange-500/5">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-orange-400 shrink-0" />
            <p className="text-sm text-gray-300">
              Extension offline — {queue.length} task{queue.length === 1 ? "" : "s"} waiting.
              They will run as soon as you open Chrome with LinkedIn logged in.
            </p>
          </div>
        </Card>
      )}

      {config.enabled && status.extensionConnected && !status.withinWorkingHours && (
        <Card className="p-4 border-sky-500/40 bg-sky-500/5">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-sky-400 shrink-0" />
            <p className="text-sm text-gray-300">
              Outside working hours — holding {queue.length} task
              {queue.length === 1 ? "" : "s"}. Next window opens{" "}
              {new Date(status.nextWindowStart).toLocaleString()} (
              {config.workingHours.start}:00–{config.workingHours.end}:00{" "}
              {config.workingHours.activeDays.map((d) => DAY_LABELS[d]).join("/")}).
              Change this on the Mission tab.
            </p>
          </div>
        </Card>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">
            {feedMode ? (
              <Rss className="h-4 w-4 mr-1.5" />
            ) : (
              <Target className="h-4 w-4 mr-1.5" />
            )}
            {feedMode ? "Feed" : "This Week"}
          </TabsTrigger>
          <TabsTrigger value="journal">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Journal
          </TabsTrigger>
          <TabsTrigger value="memory">
            <Brain className="h-4 w-4 mr-1.5" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="mission">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Mission
          </TabsTrigger>
        </TabsList>

        {/* ── This Week ─────────────────────────────────────────── */}
        <TabsContent value="week" className="space-y-4">
          {feedMode ? (
            <Card className="p-5 space-y-5">
              <div>
                <h3 className="text-sm font-medium text-gray-300">Feed settings</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Daily volume still comes from the comment and like budgets on the
                  Mission tab. These only shape what happens inside that envelope.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="comment-ratio"
                    className="text-sm text-gray-300 flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4 text-gray-500" />
                    Comment vs like
                  </label>
                  <span className="text-sm text-gray-400 tabular-nums">
                    {Math.round(feed.commentRatio * 100)}% commented
                  </span>
                </div>
                <input
                  id="comment-ratio"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(feed.commentRatio * 100)}
                  onChange={(e) =>
                    setFeed({ ...feed, commentRatio: Number(e.target.value) / 100 })
                  }
                  className="w-full accent-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  The rest of the posts it picks get read and liked, nothing written.
                  Commenting on everything reads as automated; this is the dial for how
                  loud you want to be.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-gray-300 flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-gray-500" />
                    Pitch on hiring posts
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    When a post turns out to be someone hiring, lead with the closest
                    real project from your career profile and how you built it, then
                    offer a walkthrough. Off, it comments on the substance instead.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={feed.pitchOnJobPosts}
                  onClick={() =>
                    setFeed({ ...feed, pitchOnJobPosts: !feed.pitchOnJobPosts })
                  }
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    feed.pitchOnJobPosts ? "bg-indigo-500" : "bg-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      feed.pitchOnJobPosts ? "translate-x-5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>

              <div>
                <label htmlFor="posts-per-sweep" className="text-sm text-gray-300">
                  Posts read per pass
                </label>
                <Input
                  id="posts-per-sweep"
                  type="number"
                  min={5}
                  max={60}
                  value={feed.postsPerSweep}
                  onChange={(e) =>
                    setFeed({
                      ...feed,
                      postsPerSweep: Math.max(5, Math.min(60, Number(e.target.value) || 5)),
                    })
                  }
                  className="mt-1.5 max-w-[8rem]"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  How far down the feed it scrolls in one pass. More posts read means
                  more it can engage with, and a longer scroll.
                </p>
              </div>

              <div>
                <label htmlFor="posts-per-pass" className="text-sm text-gray-300">
                  Posts engaged per pass
                </label>
                <Input
                  id="posts-per-pass"
                  type="number"
                  min={1}
                  max={25}
                  value={feed.postsPerPass}
                  onChange={(e) =>
                    setFeed({
                      ...feed,
                      postsPerPass: Math.max(1, Math.min(25, Number(e.target.value) || 1)),
                    })
                  }
                  className="mt-1.5 max-w-[8rem]"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  It likes and comments on every post it reads that it has not been
                  through before, up to this many per trip down the feed. Your weekly
                  budgets are still the hard ceiling.
                </p>
              </div>

              {feedDirty && (
                <Button size="sm" onClick={saveFeed} disabled={busy}>
                  Save feed settings
                </Button>
              )}
            </Card>
          ) : !cycle ? (
            <Card className="p-6 text-center text-gray-400">
              No plan yet. Set a mission and press Start — the agent writes its own first
              week.
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h2 className="text-lg font-medium text-white">
                      Week {cycle.weekNumber}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {new Date(cycle.startsAt).toLocaleDateString()} –{" "}
                      {new Date(cycle.endsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="info">{cycle.status}</Badge>
                </div>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {cycle.strategy}
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  {(
                    [
                      ["Prospecting", cycle.channelMix.prospecting],
                      ["Engagement", cycle.channelMix.engagement],
                      ["Content", cycle.channelMix.content],
                      ["Inbox", cycle.channelMix.inbox],
                    ] as const
                  ).map(([label, pct]) => (
                    <div key={label} className="rounded-lg bg-gray-900/60 p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-xl font-semibold text-white">{pct}%</p>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-medium text-gray-300 mb-4">
                  Targets vs actuals
                </h3>
                {cycle.targets.length === 0 ? (
                  <p className="text-sm text-gray-500">No targets set.</p>
                ) : (
                  <div className="space-y-3">
                    {cycle.targets.map((t) => {
                      const achieved =
                        cycle.actuals.find((a) => a.metric === t.metric)?.achieved ?? 0;
                      const pct =
                        t.planned > 0
                          ? Math.min(100, Math.round((achieved / t.planned) * 100))
                          : 0;
                      return (
                        <div key={t.metric}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">
                              {t.metric.replace(/_/g, " ")}
                            </span>
                            <span className="text-gray-400 tabular-nums">
                              {achieved} / {t.planned}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                pct >= 100
                                  ? "bg-emerald-500"
                                  : pct >= 50
                                    ? "bg-cyan-500"
                                    : "bg-indigo-500"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {Object.keys(funnel).length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Pipeline</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(funnel).map(([stage, count]) => (
                      <Badge key={stage} variant="info">
                        {stage.replace(/_/g, " ")}: {count}
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}

            </>
          )}

            <Card className="p-5">
              <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Queue ({queue.length})
              </h3>
              {queue.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nothing queued. The planner tops this up on its next tick.
                </p>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 10).map((task) => (
                    <div
                      key={task._id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-gray-900/60 p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-200">
                          {task.kind.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{task.rationale}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="info">{task.state}</Badge>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(task.scheduledFor).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
        </TabsContent>

        {/* ── Journal ───────────────────────────────────────────── */}
        <TabsContent value="journal">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium text-gray-300">
                  What the agent did, and why
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Updates live. Nothing here is written by hand.
                </p>
              </div>
              <a href="/api/autopilot/document?format=markdown" download>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1.5" />
                  Export
                </Button>
              </a>
            </div>

            {journal.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing logged yet.</p>
            ) : (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
                {journal.map((entry, i) => {
                  const style = ENTRY_STYLES[entry.entryType] ?? ENTRY_STYLES.observation;
                  return (
                    <div
                      key={entry._id || entry.id || `${entry.createdAt}-${i}`}
                      className="flex gap-3"
                    >
                      <div className="flex flex-col items-center pt-1.5">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", style.dot)} />
                        <span className="w-px flex-1 bg-gray-800 mt-1" />
                      </div>
                      <div className="pb-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={cn("font-medium", style.label)}>
                            {entry.entryType}
                          </span>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-500">{entry.phase}</span>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-500">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap mt-1 leading-relaxed">
                          {entry.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Memory ────────────────────────────────────────────── */}
        <TabsContent value="memory">
          <Card className="p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-1">What it has learned</h3>
            <p className="text-xs text-gray-500 mb-4">
              Distilled at the end of each week from what actually happened. Confidence rises
              when later weeks confirm a lesson and falls when they contradict it.
            </p>

            {memories.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nothing learned yet — the first review runs at the end of week 1.
              </p>
            ) : (
              <div className="space-y-2">
                {memories.map((m) => (
                  <div
                    key={m._id}
                    className="flex items-start gap-3 rounded-lg bg-gray-900/60 p-3"
                  >
                    <div className="shrink-0 w-12 text-center">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          m.confidence >= 0.7
                            ? "text-emerald-400"
                            : m.confidence >= 0.4
                              ? "text-cyan-400"
                              : "text-gray-500"
                        )}
                      >
                        {m.confidence.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-gray-600 uppercase">{m.kind}</p>
                    </div>
                    <p className="text-sm text-gray-300 flex-1">{m.statement}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Mission ───────────────────────────────────────────── */}
        <TabsContent value="mission" className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-1">
              Mission {feedMode && <span className="text-gray-500">(optional here)</span>}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {feedMode
                ? "Feed mode does not need this — it runs off your career profile. If you set one anyway, it steers which posts get picked off the feed. It only becomes required in strategist mode."
                : "One sentence. The agent decomposes this into a measurable goal and plans every week against it."}
            </p>
            <div className="flex gap-2">
              <Input
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                placeholder="e.g. land an international React/Next.js contract"
                maxLength={500}
              />
              <Button onClick={saveMission} disabled={busy || !mission.trim()}>
                Save
              </Button>
            </div>
          </Card>

          {goal && (
            <Card className="p-5 space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-1">Goal</h3>
                <p className="text-sm text-gray-200">{goal.northStar}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Success: {goal.successMetric.target}{" "}
                  {goal.successMetric.kind.replace(/_/g, " ")}
                  {goal.successMetric.by
                    ? ` by ${new Date(goal.successMetric.by).toLocaleDateString()}`
                    : ""}
                </p>
              </div>

              <div>
                <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Targeting
                </h4>
                <div className="flex flex-wrap gap-2">
                  {goal.constraints.targetRoles.map((r) => (
                    <Badge key={r} variant="info">
                      {r}
                    </Badge>
                  ))}
                  <Badge variant="info">
                    {goal.constraints.targetCompanySizeMin}–
                    {goal.constraints.targetCompanySizeMax} people
                  </Badge>
                  {goal.constraints.geographies.map((g) => (
                    <Badge key={g} variant="info">
                      {g}
                    </Badge>
                  ))}
                </div>
              </div>

              {goal.subGoals.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                    Sub-goals
                  </h4>
                  <ul className="space-y-1">
                    {goal.subGoals.map((sg, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        · {sg.text}{" "}
                        <span className="text-gray-500">
                          ({sg.metric.replace(/_/g, " ")}: {sg.target})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-1">When it works</h3>
            <p className="text-xs text-gray-500 mb-4">
              Nothing is dispatched outside this window — it is the main thing keeping
              the account looking human. Tasks queue up and run when it reopens.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Start hour</label>
                <select
                  value={hours.start}
                  onChange={(e) => setHours({ ...hours, start: Number(e.target.value) })}
                  className="w-full rounded-md bg-gray-900 border border-gray-700 px-2 py-1.5 text-sm text-gray-200"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{`${h}:00`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">End hour</label>
                <select
                  value={hours.end}
                  onChange={(e) => setHours({ ...hours, end: Number(e.target.value) })}
                  className="w-full rounded-md bg-gray-900 border border-gray-700 px-2 py-1.5 text-sm text-gray-200"
                >
                  {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                    <option key={h} value={h}>{`${h}:00`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Timezone</label>
                <Input
                  value={hours.timezone}
                  onChange={(e) => setHours({ ...hours, timezone: e.target.value })}
                  placeholder="Asia/Karachi"
                />
              </div>
            </div>

            <label className="text-xs text-gray-500 block mb-2">Active days</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {DAY_LABELS.map((label, day) => {
                const on = hours.activeDays.includes(day);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setHours({
                        ...hours,
                        activeDays: on
                          ? hours.activeDays.filter((d) => d !== day)
                          : [...hours.activeDays, day].sort(),
                      })
                    }
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm border transition-colors",
                      on
                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200"
                        : "bg-gray-900 border-gray-700 text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={saveHours} disabled={busy || !hoursDirty}>
                Save schedule
              </Button>
              {hoursDirty && (
                <span className="text-xs text-amber-300">Unsaved changes</span>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Safety envelope</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Ramp</p>
                <p className="text-gray-200">{Math.round(config.rampFactor * 100)}% of budget</p>
              </div>
              {Object.entries(config.weeklyBudgets).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500">{key} / week</p>
                  <p className="text-gray-200 tabular-nums">
                    {Math.round(value * config.rampFactor)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
