"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Key,
  Sliders,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Upload,
  Star,
  Sparkles,
  Clock,
  Activity,
  RefreshCw,
  Zap,
  TrendingDown,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────

export interface ProviderCreditsResult {
  provider: string;
  type: "credits" | "rate-limit" | "free-tier" | "error";
  totalGranted?: number;
  totalUsed?: number;
  available?: number;
  remainingRequests?: number | null;
  totalRequests?: number | null;
  remainingTokens?: number | null;
  totalTokens?: number | null;
  resetIn?: string | null;
  note?: string;
  error?: string;
}

export interface ApiKeyInfo {
  provider: string;
  isValid: boolean;
  maskedKey: string;
}

export interface AutomationSettings {
  timezone: string;
  language: string;
  notificationPrefs: { email: boolean; inApp: boolean; extension: boolean };
  dailyLimits: { applies: number; posts: number; scrapes: number };
}

// ─── Constants ──────────────────────────────────

export const providers = [
  {
    value: "gemini",
    label: "Google Gemini",
    model: "Gemini 2.5 Flash",
    free: true,
    freeEstimate: "~200 resume tailors/day",
    description: "Free tier · 1M tokens/day · 15 RPM",
    url: "https://aistudio.google.com/app/apikey",
    keyPrefix: "AIza",
  },
  {
    value: "groq",
    label: "Groq",
    model: "Llama 3.3 70B",
    free: true,
    freeEstimate: "~60 resume tailors/day",
    description: "Free tier · 30 RPM · Very fast inference",
    url: "https://console.groq.com/keys",
    keyPrefix: "gsk_",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    model: "Llama 3.3 70B (free)",
    free: true,
    freeEstimate: "~100 resume tailors/day (free models)",
    description: "Routes to many models · Free models available",
    url: "https://openrouter.ai/settings/keys",
    keyPrefix: "sk-or-",
  },
  {
    value: "openai",
    label: "OpenAI",
    model: "GPT-4o Mini",
    free: false,
    freeEstimate: null,
    description: "Pay-as-you-go · ~$0.01 per resume tailor",
    url: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    model: "Claude Sonnet 4",
    free: false,
    freeEstimate: null,
    description: "Pay-as-you-go · High quality reasoning",
    url: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
  },
];

// ─── Credits Display ─────────────────────────────

export function CreditsDisplay({ credits }: { credits: ProviderCreditsResult | undefined }) {
  if (!credits) return null;

  if (credits.type === "error") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[#FF5F57]/80 ml-8">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span>{credits.error ?? "Unable to fetch credits"}</span>
      </div>
    );
  }

  if (credits.type === "credits") {
    const pct = credits.totalGranted ? Math.round(((credits.available ?? 0) / credits.totalGranted) * 100) : 0;
    return (
      <div className="ml-8 space-y-1">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span className="text-white font-medium">${(credits.available ?? 0).toFixed(2)}</span>
            <span>available</span>
          </span>
          <span className="text-white/40">${(credits.totalUsed ?? 0).toFixed(2)} used / ${(credits.totalGranted ?? 0).toFixed(2)} granted</span>
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#00E5FF] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (credits.type === "rate-limit") {
    const reqPct =
      credits.totalRequests && credits.remainingRequests != null
        ? Math.round((credits.remainingRequests / credits.totalRequests) * 100)
        : null;
    const tokPct =
      credits.totalTokens && credits.remainingTokens != null
        ? Math.round((credits.remainingTokens / credits.totalTokens) * 100)
        : null;

    return (
      <div className="ml-8 space-y-1.5">
        {credits.remainingRequests != null && credits.totalRequests != null && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-[#00E5FF]" />
                <span>Requests</span>
              </span>
              <span>
                <span className="text-white font-medium">{credits.remainingRequests.toLocaleString()}</span>
                <span className="text-white/40"> / {credits.totalRequests.toLocaleString()} remaining</span>
              </span>
            </div>
            {reqPct !== null && (
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#00E5FF] transition-all"
                  style={{ width: `${reqPct}%` }}
                />
              </div>
            )}
          </div>
        )}
        {credits.remainingTokens != null && credits.totalTokens != null && (
          <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-purple-400" />
                <span>Tokens</span>
              </span>
              <span>
                <span className="text-white font-medium">{credits.remainingTokens.toLocaleString()}</span>
                <span className="text-white/40"> / {credits.totalTokens.toLocaleString()} remaining</span>
              </span>
            </div>
            {tokPct !== null && (
              <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-400 transition-all"
                  style={{ width: `${tokPct}%` }}
                />
              </div>
            )}
          </div>
        )}
        {credits.resetIn && (
          <p className="text-xs text-white/30 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Resets in {credits.resetIn}
          </p>
        )}
      </div>
    );
  }

  // free-tier
  return (
    <div className="flex items-center gap-1.5 text-xs text-white/50 ml-8">
      <Zap className="h-3.5 w-3.5 text-[#00E5FF]/60" />
      <span>{credits.note}</span>
    </div>
  );
}

// ─── AI Keys Tab ────────────────────────────────

export function AIKeysTab({
  apiKeys,
  loading,
  addKeyOpen,
  setAddKeyOpen,
  onRefresh,
  preferredProvider,
  setPreferredProvider,
}: {
  apiKeys: ApiKeyInfo[];
  loading: boolean;
  addKeyOpen: boolean;
  setAddKeyOpen: (open: boolean) => void;
  onRefresh: () => void;
  preferredProvider: string;
  setPreferredProvider: (p: string) => void;
}) {
  const [addingKey, setAddingKey] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState<string | null>(null);
  const [revalidatingProvider, setRevalidatingProvider] = useState<string | null>(null);
  const [credits, setCredits] = useState<ProviderCreditsResult[]>([]);
  const [fetchingCredits, setFetchingCredits] = useState(false);
  const [savingPreferred, setSavingPreferred] = useState(false);
  const { register, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: { provider: "gemini", apiKey: "" },
  });
  const watchedProvider = watch("provider");
  const selectedProviderInfo = providers.find((p) => p.value === watchedProvider);

  const fetchCredits = async () => {
    setFetchingCredits(true);
    try {
      const res = await fetch("/api/settings/api-keys/credits");
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits ?? []);
      } else {
        toast.error("Failed to fetch credit info");
      }
    } catch {
      toast.error("Network error while fetching credits");
    }
    setFetchingCredits(false);
  };

  const onRevalidate = async (provider: string) => {
    setRevalidatingProvider(provider);
    try {
      const res = await fetch(`/api/settings/api-keys?provider=${provider}`, { method: "PATCH" });
      const result = await res.json();
      if (res.ok) {
        toast.success(result.isValid ? "Key is valid ✓" : "Key validation still failed");
        onRefresh();
      } else {
        toast.error(result.error || "Revalidation failed");
      }
    } catch {
      toast.error("Network error during revalidation");
    }
    setRevalidatingProvider(null);
  };

  const onAdd = async (data: { provider: string; apiKey: string }) => {
    setAddingKey(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (res.ok) {
        toast.success(result.message);
        setAddKeyOpen(false);
        reset();
        onRefresh();
      } else {
        toast.error(result.error || "Failed to save key");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
    setAddingKey(false);
  };

  const onDelete = async (provider: string) => {
    setDeletingProvider(provider);
    try {
      await fetch(`/api/settings/api-keys?provider=${provider}`, {
        method: "DELETE",
      });
      toast.success("API key removed");
      if (preferredProvider === provider) {
        setPreferredProvider("");
      }
      onRefresh();
    } catch {
      toast.error("Failed to remove key");
    }
    setDeletingProvider(null);
  };

  const onSetPreferred = async (provider: string) => {
    const newVal = preferredProvider === provider ? "" : provider;
    setSavingPreferred(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredProvider: newVal }),
      });
      if (res.ok) {
        setPreferredProvider(newVal);
        toast.success(newVal ? `${providers.find((p) => p.value === newVal)?.label} set as primary` : "Auto-select enabled");
      }
    } catch {
      toast.error("Failed to update preference");
    }
    setSavingPreferred(false);
  };

  return (
    <div className="space-y-6">
      {/* ── API Keys Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI API Keys</CardTitle>
              <CardDescription>
                Manage your BYOK (Bring Your Own Key) API keys. All keys are
                encrypted with AES-256-GCM.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {apiKeys.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchCredits}
                  disabled={fetchingCredits}
                  title="Check remaining credits / rate limits"
                >
                  {fetchingCredits ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Check Credits
                </Button>
              )}
              <Button onClick={() => setAddKeyOpen(true)} size="sm">
                <Plus className="h-4 w-4" />
                Add Key
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-white/5" />
              ))}
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="h-10 w-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No API keys configured</p>
              <p className="text-white/25 text-xs mt-1">
                Add your free Gemini, Groq, or OpenRouter key to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => {
                const providerInfo = providers.find(
                  (p) => p.value === key.provider
                );
                const isPreferred = preferredProvider === key.provider;
                return (
                  <div
                    key={key.provider}
                    className={cn(
                      "rounded-xl bg-white/5 border px-4 py-3 space-y-2 transition-colors",
                      isPreferred
                        ? "border-[#00E5FF]/40 bg-[#00E5FF]/5"
                        : "border-white/10"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {key.isValid ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-5 w-5 text-[#FF5F57] shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white">
                              {providerInfo?.label || key.provider}
                            </p>
                            {providerInfo?.free && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                                Free
                              </span>
                            )}
                            {isPreferred && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#00E5FF]/15 text-[#00E5FF] px-1.5 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-white/40 font-mono">
                              {key.maskedKey}
                            </p>
                            {providerInfo?.model && (
                              <span className="text-xs text-white/30">
                                · {providerInfo.model}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {key.isValid && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onSetPreferred(key.provider)}
                            disabled={savingPreferred}
                            title={isPreferred ? "Unset as primary" : "Set as primary model"}
                            className={cn(
                              "transition-colors",
                              isPreferred
                                ? "text-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/10"
                                : "text-white/30 hover:text-[#00E5FF] hover:bg-[#00E5FF]/10"
                            )}
                          >
                            <Star className={cn("h-4 w-4", isPreferred && "fill-current")} />
                          </Button>
                        )}
                        {!key.isValid && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRevalidate(key.provider)}
                            disabled={revalidatingProvider === key.provider}
                            title="Re-validate key"
                            className="text-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/10"
                          >
                            {revalidatingProvider === key.provider ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(key.provider)}
                          disabled={deletingProvider === key.provider}
                        >
                          {deletingProvider === key.provider ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-[#FF5F57]" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <CreditsDisplay credits={credits.find((c) => c.provider === key.provider)} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Available Providers ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available Providers</CardTitle>
          <CardDescription>
            Get a free API key and start tailoring resumes in minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((p) => {
              const hasKey = apiKeys.some((k) => k.provider === p.value);
              return (
                <div
                  key={p.value}
                  className={cn(
                    "rounded-xl border px-4 py-3 transition-colors",
                    hasKey
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-white/10 bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{p.label}</span>
                      {p.free && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                          Free
                        </span>
                      )}
                      {hasKey && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-white/40 mb-1">{p.description}</p>
                  <p className="text-xs text-white/30">
                    Model: <span className="text-white/50">{p.model}</span>
                    {p.freeEstimate && (
                      <> · <span className="text-emerald-400/70">{p.freeEstimate}</span></>
                    )}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    Key starts with: <code className="text-white/50 bg-white/5 px-1 rounded">{p.keyPrefix}</code>
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#00E5FF] hover:underline inline-flex items-center gap-1"
                    >
                      Get API Key →
                    </a>
                    {!hasKey && (
                      <button
                        onClick={() => {
                          setValue("provider", p.value);
                          setAddKeyOpen(true);
                        }}
                        className="text-xs text-white/40 hover:text-white transition-colors"
                      >
                        Add Key
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Add Key Dialog ── */}
      <Dialog open={addKeyOpen} onOpenChange={setAddKeyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add API Key</DialogTitle>
            <DialogDescription>
              Your key will be encrypted with AES-256-GCM before storage.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onAdd)} className="space-y-4">
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                {...register("provider")}
                onChange={(e) => setValue("provider", e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.model}
                  </option>
                ))}
              </Select>
              {selectedProviderInfo && (
                <div className="rounded-lg bg-white/5 border border-white/10 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    {selectedProviderInfo.free ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded">
                        Free
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded">
                        Paid
                      </span>
                    )}
                    <span className="text-xs text-white/50">{selectedProviderInfo.description}</span>
                  </div>
                  {selectedProviderInfo.freeEstimate && (
                    <p className="text-xs text-emerald-400/70">{selectedProviderInfo.freeEstimate}</p>
                  )}
                  <p className="text-xs text-white/30">
                    Key starts with: <code className="text-white/50 bg-white/5 px-1 rounded">{selectedProviderInfo.keyPrefix}</code>
                  </p>
                  <a
                    href={selectedProviderInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#00E5FF] hover:underline inline-flex items-center gap-1"
                  >
                    Get your {selectedProviderInfo.label} API key →
                  </a>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={selectedProviderInfo ? `Starts with ${selectedProviderInfo.keyPrefix}...` : "Paste your API key"}
                {...register("apiKey")}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddKeyOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addingKey}>
                {addingKey ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Save & Validate"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Automation Tab ─────────────────────────────

export function AutomationTab({
  settings,
}: {
  settings: AutomationSettings | null;
}) {
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState({
    applies: settings?.dailyLimits?.applies ?? 15,
    posts: settings?.dailyLimits?.posts ?? 2,
    scrapes: settings?.dailyLimits?.scrapes ?? 50,
  });
  const [notifs, setNotifs] = useState({
    email: settings?.notificationPrefs?.email ?? true,
    inApp: settings?.notificationPrefs?.inApp ?? true,
    extension: settings?.notificationPrefs?.extension ?? true,
  });

  useEffect(() => {
    if (settings) {
      setLimits(settings.dailyLimits);
      setNotifs(settings.notificationPrefs);
    }
  }, [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLimits: limits,
          notificationPrefs: notifs,
        }),
      });
      if (res.ok) toast.success("Settings saved");
      else toast.error("Failed to save");
    } catch {
      toast.error("Network error. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Action Limits</CardTitle>
          <CardDescription>
            Set safe limits to avoid LinkedIn detection. Conservative defaults
            recommended.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          {[
            {
              key: "applies" as const,
              label: "Job Applications / Day",
              max: 50,
            },
            { key: "posts" as const, label: "Posts / Day", max: 10 },
            { key: "scrapes" as const, label: "Scrapes / Day", max: 200 },
          ].map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{item.label}</Label>
                <span className="text-sm font-mono text-white/60">
                  {limits[item.key]}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={item.max}
                value={limits[item.key]}
                onChange={(e) =>
                  setLimits({
                    ...limits,
                    [item.key]: parseInt(e.target.value),
                  })
                }
                className="w-full accent-blue-500"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Choose how you want to be notified about automation events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          {[
            { key: "email" as const, label: "Email Notifications" },
            { key: "inApp" as const, label: "In-App Notifications" },
            { key: "extension" as const, label: "Extension Notifications" },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between"
            >
              <Label>{item.label}</Label>
              <Switch
                checked={notifs[item.key]}
                onCheckedChange={(checked) =>
                  setNotifs({ ...notifs, [item.key]: checked })
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Settings"
        )}
      </Button>
    </div>
  );
}

// ─── Resume Tab ─────────────────────────────────

interface ResumeItem {
  _id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  contactInfo?: { name?: string; email?: string; phone?: string; location?: string; linkedin?: string; github?: string; portfolio?: string };
  skills?: string[];
  experience?: { company?: string; title?: string; startDate?: string; endDate?: string; current?: boolean; description?: string; highlights?: string[] }[];
  education?: { school?: string; degree?: string; field?: string; startDate?: string; endDate?: string; gpa?: string }[];
  summary?: string;
  certifications?: { name?: string; issuer?: string; date?: string }[];
  projects?: { name?: string; description?: string; url?: string; tech?: string[] }[];
  customTailoringPrompt?: string;
}

interface ParsedResumeData {
  contactInfo: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
  };
  summary: string;
  experience: {
    company: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    current: boolean;
    description: string;
    highlights: string[];
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
  }[];
  skills: string[];
  certifications: { name: string; issuer: string; date?: string | null }[];
  projects: { name: string; description: string; url?: string | null; tech: string[] }[];
}

const DEFAULT_TAILORING_PROMPT = `Match my tech stack exactly to the job description — use their terminology, their framework names, their tool versions. First sentence of summary must contain the exact job title and my years of relevant experience. Every highlight must map to a specific requirement from the JD. Preserve all my quantified achievements (percentages, dollar amounts, user counts, performance metrics) but frame them through the lens of what this role needs. Prioritize required skills over nice-to-haves. If I have adjacent experience to a required skill, bridge it explicitly. Remove any skill or experience that doesn't serve this specific application. My resume should make the recruiter think "this person already does this job."`;

const EXAMPLE_PROMPTS: { label: string; quote: string; prompt: string }[] = [
  {
    label: "The Sniper",
    quote: "Don't apply to jobs. Apply to this job.",
    prompt: `Mirror the exact job title in the first sentence of my summary. Pull the top 5 keywords directly from the job description and embed them naturally in my summary, skills, and at least 2 highlights. Rewrite my tech stack to match theirs — if they use "Node.js" not "NodeJS", use their spelling. Strip out every skill not mentioned in the job posting. Every bullet point must answer one question: "Does this make me the obvious hire for this specific role?" If the JD mentions specific tools like Jira, Confluence, or specific cloud services — mention them by name in my experience.`,
  },
  {
    label: "The Kingmaker",
    quote: "They don't hire coders. They hire people who make things happen.",
    prompt: `Reposition every experience entry around business outcomes, not technical tasks. Replace "implemented X" with "drove X resulting in Y". Lead with scale: team size, users impacted, revenue influenced, cost saved. Use leadership language throughout — "architected", "championed", "owned end-to-end", "led cross-functional". My summary should sound like a business case for hiring me, not a list of tools I know. If the job mentions stakeholder management, P&L, or cross-team collaboration, weave those into at least 3 highlights.`,
  },
  {
    label: "The Chameleon",
    quote: "Your past doesn't define your direction. Make it your launchpad.",
    prompt: `I am pivoting into a new field. Reframe every bullet point to extract skills that transfer — problem-solving, data analysis, stakeholder management, iterative delivery. Avoid job titles from my old field in the summary; lead with what I bring, not where I came from. Identify 3 transferable strengths and front-load them. Make the narrative feel like a strategic move, not a restart. Downplay irrelevant stack; amplify mindset and methodology. Bridge the gap: for each JD requirement I don't directly have, find the closest thing in my background and frame it as directly applicable.`,
  },
  {
    label: "The Maverick",
    quote: "Built in a garage. Scaled to millions. That's the energy.",
    prompt: `This is for a fast-moving startup or growth-stage company. Rewrite my experience to show I move fast, wear multiple hats, and ship with ownership. Use high-velocity language: "shipped in 2 weeks", "zero to production in X days", "solo-owned the full stack". Highlight any instances of ambiguity, tight deadlines, or resource constraints I overcame. Metrics should show growth rate and efficiency, not just output. Remove anything that sounds corporate, slow, or committee-driven. If the JD mentions "scrappy", "fast-paced", or "ambiguous environments" — my entire resume should breathe that energy.`,
  },
  {
    label: "The Ghost",
    quote: "Invisible by day. Indispensable by deadline.",
    prompt: `Optimize this resume for a fully remote or async-first company. Weave in async communication, written clarity, and self-direction naturally across summary and highlights — not as a section, as a thread. Reference tools like Notion, Linear, GitHub, Figma, Slack, Loom where I've actually used them. Show I can manage my own time, unblock myself, communicate across timezones, and ship without hand-holding. The ideal reader should think: "This person has figured out remote work." If the JD mentions timezone overlap, documentation-driven culture, or distributed teams — reflect that in my experience bullets.`,
  },
  {
    label: "The Interview Ace",
    quote: "Your resume is your interview script. Write it accordingly.",
    prompt: `Tailor every highlight so it becomes a natural talking point in a behavioral interview. Each bullet should implicitly follow the STAR format: what was the situation, what did I do, what was the measurable result. Make sure I can elaborate on every single claim for 2-3 minutes if asked. Match the JD's required experience areas so when they ask "Tell me about a time you did X" — X is already a bullet on my resume. Remove anything I can't speak to confidently. Prioritize depth over breadth.`,
  },
];

export function ResumeTab() {
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [parseOpen, setParseOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [rawText, setRawText] = useState("");
  const [resumeName, setResumeName] = useState("");
  const [expandedResume, setExpandedResume] = useState<string | null>(null);
  const [resumeDetail, setResumeDetail] = useState<ResumeItem | null>(null);

  // Review/Edit parsed resume state
  const [reviewOpen, setReviewOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const [parsedRawText, setParsedRawText] = useState("");
  const [parsedName, setParsedName] = useState("");
  const [saving, setSaving] = useState(false);

  // Custom prompt editing
  const [promptEditId, setPromptEditId] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);

  // Inline edit mode
  const [editingResumeId, setEditingResumeId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ParsedResumeData> | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchResumes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/resume");
      if (res.ok) {
        const data = await res.json();
        setResumes(data.resumes || []);
      }
    } catch {
      toast.error("Failed to load resumes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResumes();
  }, [fetchResumes]);

  // Auto-select the only resume for the prompt editor
  useEffect(() => {
    if (resumes.length === 1 && promptEditId === null) {
      setPromptEditId(resumes[0]._id);
      setPromptDraft(resumes[0].customTailoringPrompt || "");
    }
  }, [resumes, promptEditId]);

  const parseResume = async () => {
    if (!rawText.trim()) {
      toast.error("Please paste your resume text");
      return;
    }
    if (!resumeName.trim()) {
      toast.error("Please enter a name for this resume");
      return;
    }

    setParsing(true);
    try {
      const res = await fetch("/api/resume?action=parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, name: resumeName }),
      });

      if (res.ok) {
        const data = await res.json();
        setParsedData(data.parsed);
        setParsedRawText(data.rawText || rawText);
        setParsedName(data.name || resumeName);
        setParseOpen(false);
        setReviewOpen(true);
        toast.success("Resume parsed! Review the extracted data below.");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to parse resume");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
    setParsing(false);
  };

  const saveReviewedResume = async () => {
    if (!parsedData) return;
    setSaving(true);
    try {
      const res = await fetch("/api/resume?action=save-parsed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parsedName, parsed: parsedData, rawText: parsedRawText }),
      });

      if (res.ok) {
        toast.success("Resume saved successfully");
        setReviewOpen(false);
        setParsedData(null);
        setRawText("");
        setResumeName("");
        fetchResumes();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save resume");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
    setSaving(false);
  };

  const deleteResume = async (id: string) => {
    try {
      const res = await fetch(`/api/resume?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Resume deleted");
        fetchResumes();
      } else {
        toast.error("Failed to delete resume");
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  const setDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/resume?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) {
        toast.success("Default resume updated");
        fetchResumes();
      }
    } catch {
      toast.error("Network error. Please try again.");
    }
  };

  const viewDetail = async (id: string) => {
    if (expandedResume === id) {
      setExpandedResume(null);
      setResumeDetail(null);
      return;
    }
    try {
      const res = await fetch(`/api/resume`);
      if (res.ok) {
        const data = await res.json();
        const found = (data.resumes || []).find(
          (r: ResumeItem) => r._id === id
        );
        setResumeDetail(found);
        setExpandedResume(id);
      }
    } catch {
      toast.error("Failed to load resume details");
    }
  };

  const saveCustomPrompt = async (id: string) => {
    setSavingPrompt(true);
    try {
      const res = await fetch(`/api/resume?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customTailoringPrompt: promptDraft }),
      });
      if (res.ok) {
        toast.success("Custom prompt saved");
        fetchResumes();
      } else {
        toast.error("Failed to save prompt");
      }
    } catch {
      toast.error("Network error");
    }
    setSavingPrompt(false);
  };

  const startEditResume = (resume: ResumeItem) => {
    setEditingResumeId(resume._id);
    setEditData({
      contactInfo: {
        name: resume.contactInfo?.name ?? "",
        email: resume.contactInfo?.email ?? "",
        phone: resume.contactInfo?.phone ?? "",
        location: resume.contactInfo?.location ?? "",
        linkedin: resume.contactInfo?.linkedin ?? "",
        github: resume.contactInfo?.github ?? "",
        portfolio: resume.contactInfo?.portfolio ?? "",
      },
      summary: resume.summary ?? "",
      skills: resume.skills ?? [],
      experience: (resume.experience ?? []).map((e) => ({
        company: e.company ?? "",
        title: e.title ?? "",
        startDate: e.startDate ?? "",
        endDate: e.endDate ?? "",
        current: e.current ?? false,
        description: e.description ?? "",
        highlights: e.highlights ?? [],
      })),
      education: (resume.education ?? []).map((e) => ({
        school: e.school ?? "",
        degree: e.degree ?? "",
        field: e.field ?? "",
        startDate: e.startDate ?? "",
        endDate: e.endDate ?? "",
        gpa: e.gpa ?? "",
      })),
    });
  };

  const saveEditResume = async () => {
    if (!editingResumeId || !editData) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/resume?id=${editingResumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        toast.success("Resume updated");
        setEditingResumeId(null);
        setEditData(null);
        fetchResumes();
        if (expandedResume === editingResumeId) {
          setExpandedResume(null);
          setResumeDetail(null);
        }
      } else {
        toast.error("Failed to update resume");
      }
    } catch {
      toast.error("Network error");
    }
    setSavingEdit(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Resume List ────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Resumes</CardTitle>
              <CardDescription>
                Upload and manage resumes. AI will parse them into structured data for auto-applying.
              </CardDescription>
            </div>
            <Button onClick={() => setParseOpen(true)} size="sm">
              <Plus className="h-4 w-4" />
              Add Resume
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-[#1A1A1A]" />
              ))}
            </div>
          ) : resumes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-[#333333] mx-auto mb-3" />
              <p className="text-[#888888] text-sm">No resumes yet</p>
              <p className="text-[#444444] text-xs mt-1">
                Paste your resume text to let AI parse it into structured data
              </p>
              <Button
                onClick={() => setParseOpen(true)}
                size="sm"
                className="mt-4"
              >
                <Upload className="h-4 w-4" />
                Upload Resume
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {resumes.map((resume) => (
                <div key={resume._id}>
                  <div className="flex items-center justify-between rounded-xl bg-[#111111] border border-[#1A1A1A] px-4 py-3 hover:border-[#333333] transition-colors">
                    <button
                      onClick={() => viewDetail(resume._id)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <FileText className="h-5 w-5 text-[#00E5FF]" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">
                            {resume.name}
                          </p>
                          {resume.isDefault && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#FEBC2E] bg-[#FEBC2E]/10 px-1.5 py-0.5 rounded">
                              <Star className="h-2.5 w-2.5" />
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#555555]">
                          {resume.contactInfo?.email || "No email"} ·{" "}
                          {resume.skills?.length || 0} skills ·{" "}
                          {resume.experience?.length || 0} positions · Added{" "}
                          {new Date(resume.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      {!resume.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDefault(resume._id)}
                          title="Set as default"
                        >
                          <Star className="h-4 w-4 text-[#444444]" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          startEditResume(resume);
                          viewDetail(resume._id);
                        }}
                        title="Edit resume"
                      >
                        <Sliders className="h-4 w-4 text-[#444444]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteResume(resume._id)}
                      >
                        <Trash2 className="h-4 w-4 text-[#FF5F57]" />
                      </Button>
                    </div>
                  </div>

                  {/* ── Expanded detail view ─────── */}
                  {expandedResume === resume._id && resumeDetail && editingResumeId !== resume._id && (
                    <div className="ml-4 mt-1 mb-3 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A] p-4 space-y-4">
                      {resumeDetail.summary ? (
                        <div>
                          <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-1">Summary</p>
                          <p className="text-xs text-[#666666] leading-relaxed">{resumeDetail.summary}</p>
                        </div>
                      ) : null}
                      {resumeDetail.skills && resumeDetail.skills.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-1">Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {resumeDetail.skills.map((s: string, i: number) => (
                              <span key={i} className="text-[10px] bg-[#00E5FF]/10 text-[#00E5FF] px-1.5 py-0.5 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {resumeDetail.experience && resumeDetail.experience.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-1">Experience</p>
                          <div className="space-y-1">
                            {resumeDetail.experience.map((exp, i: number) => (
                              <p key={i} className="text-xs text-[#666666]">
                                <span className="text-[#999999]">{exp.title}</span> at {exp.company}
                                {exp.startDate && ` (${exp.startDate} - ${exp.endDate || "Present"})`}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ── Inline Edit Mode ────────── */}
                  {editingResumeId === resume._id && editData && (
                    <div className="ml-4 mt-1 mb-3 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A] p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[#00E5FF]">Editing Resume</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditingResumeId(null); setEditData(null); }}>
                            Cancel
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={saveEditResume} disabled={savingEdit}>
                            {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save Changes"}
                          </Button>
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div>
                        <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Contact Info</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["name", "email", "phone", "location", "linkedin", "github"] as const).map((field) => (
                            <div key={field} className="space-y-1">
                              <Label className="text-[10px] uppercase tracking-wider">{field}</Label>
                              <Input
                                className="h-8 text-xs"
                                value={(editData.contactInfo as Record<string, string>)?.[field] || ""}
                                onChange={(e) => {
                                  setEditData((prev) => ({
                                    ...prev,
                                    contactInfo: { ...prev?.contactInfo, [field]: e.target.value },
                                  }));
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Summary */}
                      <div>
                        <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Summary</p>
                        <Textarea
                          className="text-xs"
                          rows={3}
                          value={editData.summary || ""}
                          onChange={(e) => setEditData((prev) => ({ ...prev, summary: e.target.value }))}
                        />
                      </div>

                      {/* Skills */}
                      <div>
                        <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Skills</p>
                        <Textarea
                          className="text-xs"
                          rows={2}
                          value={(editData.skills || []).join(", ")}
                          placeholder="Comma-separated skills..."
                          onChange={(e) => setEditData((prev) => ({ ...prev, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
                        />
                      </div>

                      {/* Experience */}
                      <div>
                        <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Experience</p>
                        <div className="space-y-3">
                          {(editData.experience || []).map((exp, idx) => (
                            <div key={idx} className="border border-[#1A1A1A] rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">Title</Label>
                                  <Input className="h-8 text-xs" value={exp.title} onChange={(e) => {
                                    const updated = [...(editData.experience || [])];
                                    updated[idx] = { ...updated[idx], title: e.target.value };
                                    setEditData((prev) => ({ ...prev, experience: updated }));
                                  }} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">Company</Label>
                                  <Input className="h-8 text-xs" value={exp.company} onChange={(e) => {
                                    const updated = [...(editData.experience || [])];
                                    updated[idx] = { ...updated[idx], company: e.target.value };
                                    setEditData((prev) => ({ ...prev, experience: updated }));
                                  }} />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider">Description</Label>
                                <Textarea className="text-xs" rows={2} value={exp.description} onChange={(e) => {
                                  const updated = [...(editData.experience || [])];
                                  updated[idx] = { ...updated[idx], description: e.target.value };
                                  setEditData((prev) => ({ ...prev, experience: updated }));
                                }} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider">Highlights (one per line)</Label>
                                <Textarea className="text-xs" rows={2} value={(exp.highlights || []).join("\n")} onChange={(e) => {
                                  const updated = [...(editData.experience || [])];
                                  updated[idx] = { ...updated[idx], highlights: e.target.value.split("\n").filter(Boolean) };
                                  setEditData((prev) => ({ ...prev, experience: updated }));
                                }} />
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">Start</Label>
                                  <Input className="h-8 text-xs" placeholder="MM/YYYY" value={exp.startDate} onChange={(e) => {
                                    const updated = [...(editData.experience || [])];
                                    updated[idx] = { ...updated[idx], startDate: e.target.value };
                                    setEditData((prev) => ({ ...prev, experience: updated }));
                                  }} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">End</Label>
                                  <Input className="h-8 text-xs" placeholder="MM/YYYY or Present" value={exp.endDate || ""} onChange={(e) => {
                                    const updated = [...(editData.experience || [])];
                                    updated[idx] = { ...updated[idx], endDate: e.target.value };
                                    setEditData((prev) => ({ ...prev, experience: updated }));
                                  }} />
                                </div>
                                <div className="flex items-end pb-1">
                                  <label className="flex items-center gap-1.5 text-[10px] text-[#888888]">
                                    <input type="checkbox" checked={exp.current} onChange={(e) => {
                                      const updated = [...(editData.experience || [])];
                                      updated[idx] = { ...updated[idx], current: e.target.checked };
                                      setEditData((prev) => ({ ...prev, experience: updated }));
                                    }} className="rounded border-[#333333]" />
                                    Current
                                  </label>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Education */}
                      <div>
                        <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Education</p>
                        <div className="space-y-3">
                          {(editData.education || []).map((edu, idx) => (
                            <div key={idx} className="border border-[#1A1A1A] rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">Degree</Label>
                                  <Input className="h-8 text-xs" value={edu.degree} onChange={(e) => {
                                    const updated = [...(editData.education || [])];
                                    updated[idx] = { ...updated[idx], degree: e.target.value };
                                    setEditData((prev) => ({ ...prev, education: updated }));
                                  }} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">Field</Label>
                                  <Input className="h-8 text-xs" value={edu.field} onChange={(e) => {
                                    const updated = [...(editData.education || [])];
                                    updated[idx] = { ...updated[idx], field: e.target.value };
                                    setEditData((prev) => ({ ...prev, education: updated }));
                                  }} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider">School</Label>
                                  <Input className="h-8 text-xs" value={edu.school} onChange={(e) => {
                                    const updated = [...(editData.education || [])];
                                    updated[idx] = { ...updated[idx], school: e.target.value };
                                    setEditData((prev) => ({ ...prev, education: updated }));
                                  }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button size="sm" onClick={saveEditResume} disabled={savingEdit}>
                          {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Changes"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Tailoring Prompt ────────────────── */}
      {resumes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#00E5FF]/10 border border-[#00E5FF]/20">
                <Sparkles className="h-4 w-4 text-[#00E5FF]" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">AI Tailoring Prompt</CardTitle>
                <CardDescription>
                  Tell the AI exactly how to tailor your resume for each job application. Your prompt is added on top of the built-in rules.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resume selector (if multiple resumes) */}
            {resumes.length > 1 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider">Select Resume</Label>
                <div className="flex flex-wrap gap-2">
                  {resumes.map((r) => (
                    <button
                      key={r._id}
                      onClick={() => {
                        setPromptEditId(r._id);
                        setPromptDraft(r.customTailoringPrompt || "");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                        promptEditId === r._id
                          ? "border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]"
                          : "border-[#1A1A1A] bg-[#111111] text-[#888888] hover:border-[#333333]"
                      )}
                    >
                      <FileText className="h-3 w-3" />
                      {r.name}
                      {r.isDefault && <span className="text-[#FEBC2E]">·</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Prompt editor */}
            {promptEditId ? (() => {
              const selectedResume = resumes.find((r) => r._id === promptEditId);
              return (
                <div className="space-y-3">
                  <Textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    placeholder="Describe how you want the AI to tailor your resume. Focus on tone, priorities, tech stack preferences, what to emphasize, what to avoid..."
                    rows={6}
                    className="font-mono text-xs leading-relaxed"
                  />

                  {/* Example prompts carousel */}
                  <div className="rounded-lg border border-[#1A1A1A] bg-[#0A0A0A] overflow-hidden">
                    {/* Header with navigation */}
                    <div className="flex items-center justify-between border-b border-[#1A1A1A] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-medium text-[#00E5FF] uppercase tracking-widest">Example Prompts</p>
                        <span className="text-[10px] text-[#333333]">{exampleIndex + 1} / {EXAMPLE_PROMPTS.length}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setExampleIndex((i) => (i - 1 + EXAMPLE_PROMPTS.length) % EXAMPLE_PROMPTS.length)}
                          className="flex h-6 w-6 items-center justify-center rounded border border-[#1A1A1A] text-[#555555] hover:border-[#333333] hover:text-[#888888] transition-colors"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setExampleIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length)}
                          className="flex h-6 w-6 items-center justify-center rounded border border-[#1A1A1A] text-[#555555] hover:border-[#333333] hover:text-[#888888] transition-colors"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    {/* Dot tabs + label */}
                    <div className="flex items-center gap-1.5 px-4 pt-3">
                      {EXAMPLE_PROMPTS.map((_ex, i) => (
                        <button
                          key={i}
                          onClick={() => setExampleIndex(i)}
                          className={cn(
                            "rounded-full transition-all",
                            i === exampleIndex
                              ? "w-4 h-1.5 bg-[#00E5FF]"
                              : "w-1.5 h-1.5 bg-[#333333] hover:bg-[#555555]"
                          )}
                        />
                      ))}
                      <span className="ml-2 text-[10px] font-semibold text-[#00E5FF] tracking-wide">{EXAMPLE_PROMPTS[exampleIndex].label}</span>
                    </div>
                    {/* Quotation */}
                    <p className="px-4 pt-2.5 pb-0 text-[11px] font-medium text-[#888888] italic">
                      &ldquo;{EXAMPLE_PROMPTS[exampleIndex].quote}&rdquo;
                    </p>
                    {/* Prompt text */}
                    <p className="px-4 pt-2 pb-3 text-[11px] text-[#555555] leading-relaxed font-mono">
                      {EXAMPLE_PROMPTS[exampleIndex].prompt}
                    </p>
                    {/* Use button */}
                    <div className="flex justify-end border-t border-[#1A1A1A] px-4 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-[#00E5FF] hover:bg-[#00E5FF]/10"
                        onClick={() => setPromptDraft(EXAMPLE_PROMPTS[exampleIndex].prompt)}
                      >
                        Use this prompt ↑
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-[#444444]">
                      Editing prompt for <span className="text-[#888888]">{selectedResume?.name}</span>
                    </p>
                    <div className="flex gap-2">
                      {promptDraft && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-[#FF5F57] hover:text-[#FF5F57]"
                          onClick={() => setPromptDraft("")}
                        >
                          Clear
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => saveCustomPrompt(promptEditId)}
                        disabled={savingPrompt}
                      >
                        {savingPrompt ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />Saving...</>
                        ) : (
                          "Save Prompt"
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-[#444444]">Select a resume above to set its tailoring prompt</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Parse Dialog ───────────────────────── */}
      <Dialog open={parseOpen} onOpenChange={setParseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Sparkles className="h-5 w-5 inline-block mr-2 text-[#00E5FF]" />
              Add Resume (AI Parse)
            </DialogTitle>
            <DialogDescription>
              Paste your resume text below. AI will extract contact info, experience, education, skills, and more. You&apos;ll be able to review and edit before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resume Name</Label>
              <Input
                placeholder="e.g., Software Engineer Resume, General Resume"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Resume Text</Label>
              <Textarea
                placeholder="Copy and paste your complete resume text here. The AI will structure it automatically..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={12}
              />
              <p className="text-xs text-[#444444]">
                Tip: Copy text directly from your PDF or document for best results
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setParseOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={parseResume}
              disabled={parsing || !rawText.trim() || !resumeName.trim()}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Parse Resume
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Review Parsed Data Dialog ──────────── */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <CheckCircle2 className="h-5 w-5 inline-block mr-2 text-[#28C840]" />
              Review Parsed Resume
            </DialogTitle>
            <DialogDescription>
              AI has extracted the data below. Edit any fields that look incorrect before saving.
            </DialogDescription>
          </DialogHeader>

          {parsedData && (
            <div className="space-y-5 py-2">
              {/* Contact Info */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Contact Info</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["name", "email", "phone", "location", "linkedin", "github", "portfolio"] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider">{field}</Label>
                      <Input
                        className="h-8 text-xs"
                        value={(parsedData.contactInfo[field] as string) || ""}
                        onChange={(e) => {
                          setParsedData((prev) => prev ? ({
                            ...prev,
                            contactInfo: { ...prev.contactInfo, [field]: e.target.value || null },
                          }) : prev);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Summary */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Summary</p>
                <Textarea
                  className="text-xs"
                  rows={3}
                  value={parsedData.summary}
                  onChange={(e) => setParsedData((prev) => prev ? ({ ...prev, summary: e.target.value }) : prev)}
                />
              </div>

              <Separator />

              {/* Skills */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Skills</p>
                <Textarea
                  className="text-xs"
                  rows={2}
                  value={parsedData.skills.join(", ")}
                  placeholder="Comma-separated skills..."
                  onChange={(e) => setParsedData((prev) => prev ? ({
                    ...prev,
                    skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }) : prev)}
                />
                <p className="text-[10px] text-[#444444] mt-1">Separate skills with commas</p>
              </div>

              <Separator />

              {/* Experience */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Experience ({parsedData.experience.length})</p>
                <div className="space-y-3">
                  {parsedData.experience.map((exp, idx) => (
                    <div key={idx} className="border border-[#1A1A1A] rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Title</Label>
                          <Input className="h-8 text-xs" value={exp.title} onChange={(e) => {
                            const updated = [...parsedData.experience];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Company</Label>
                          <Input className="h-8 text-xs" value={exp.company} onChange={(e) => {
                            const updated = [...parsedData.experience];
                            updated[idx] = { ...updated[idx], company: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                          }} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider">Description</Label>
                        <Textarea className="text-xs" rows={2} value={exp.description} onChange={(e) => {
                          const updated = [...parsedData.experience];
                          updated[idx] = { ...updated[idx], description: e.target.value };
                          setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                        }} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider">Highlights (one per line)</Label>
                        <Textarea className="text-xs" rows={2} value={exp.highlights.join("\n")} onChange={(e) => {
                          const updated = [...parsedData.experience];
                          updated[idx] = { ...updated[idx], highlights: e.target.value.split("\n").filter(Boolean) };
                          setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                        }} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Start Date</Label>
                          <Input className="h-8 text-xs" placeholder="MM/YYYY" value={exp.startDate} onChange={(e) => {
                            const updated = [...parsedData.experience];
                            updated[idx] = { ...updated[idx], startDate: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">End Date</Label>
                          <Input className="h-8 text-xs" placeholder="MM/YYYY" value={exp.endDate || ""} onChange={(e) => {
                            const updated = [...parsedData.experience];
                            updated[idx] = { ...updated[idx], endDate: e.target.value || null };
                            setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                          }} />
                        </div>
                        <div className="flex items-end pb-1">
                          <label className="flex items-center gap-1.5 text-[10px] text-[#888888]">
                            <input type="checkbox" checked={exp.current} onChange={(e) => {
                              const updated = [...parsedData.experience];
                              updated[idx] = { ...updated[idx], current: e.target.checked };
                              setParsedData((prev) => prev ? ({ ...prev, experience: updated }) : prev);
                            }} className="rounded border-[#333333]" />
                            Current
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Education */}
              <div>
                <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Education ({parsedData.education.length})</p>
                <div className="space-y-3">
                  {parsedData.education.map((edu, idx) => (
                    <div key={idx} className="border border-[#1A1A1A] rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Degree</Label>
                          <Input className="h-8 text-xs" value={edu.degree} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], degree: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Field</Label>
                          <Input className="h-8 text-xs" value={edu.field} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], field: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">School</Label>
                          <Input className="h-8 text-xs" value={edu.school} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], school: e.target.value };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">Start</Label>
                          <Input className="h-8 text-xs" placeholder="MM/YYYY" value={edu.startDate || ""} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], startDate: e.target.value || null };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">End</Label>
                          <Input className="h-8 text-xs" placeholder="MM/YYYY" value={edu.endDate || ""} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], endDate: e.target.value || null };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider">GPA</Label>
                          <Input className="h-8 text-xs" value={edu.gpa || ""} onChange={(e) => {
                            const updated = [...parsedData.education];
                            updated[idx] = { ...updated[idx], gpa: e.target.value || null };
                            setParsedData((prev) => prev ? ({ ...prev, education: updated }) : prev);
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Certifications */}
              {parsedData.certifications.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Certifications ({parsedData.certifications.length})</p>
                    <div className="space-y-2">
                      {parsedData.certifications.map((cert, idx) => (
                        <div key={idx} className="grid grid-cols-3 gap-2 border border-[#1A1A1A] rounded-lg p-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Name</Label>
                            <Input className="h-8 text-xs" value={cert.name} onChange={(e) => {
                              const updated = [...parsedData.certifications];
                              updated[idx] = { ...updated[idx], name: e.target.value };
                              setParsedData((prev) => prev ? ({ ...prev, certifications: updated }) : prev);
                            }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Issuer</Label>
                            <Input className="h-8 text-xs" value={cert.issuer} onChange={(e) => {
                              const updated = [...parsedData.certifications];
                              updated[idx] = { ...updated[idx], issuer: e.target.value };
                              setParsedData((prev) => prev ? ({ ...prev, certifications: updated }) : prev);
                            }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Date</Label>
                            <Input className="h-8 text-xs" value={cert.date || ""} onChange={(e) => {
                              const updated = [...parsedData.certifications];
                              updated[idx] = { ...updated[idx], date: e.target.value || null };
                              setParsedData((prev) => prev ? ({ ...prev, certifications: updated }) : prev);
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Projects */}
              {parsedData.projects.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-[#888888] uppercase tracking-wider mb-2">Projects ({parsedData.projects.length})</p>
                    <div className="space-y-3">
                      {parsedData.projects.map((proj, idx) => (
                        <div key={idx} className="border border-[#1A1A1A] rounded-lg p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase tracking-wider">Name</Label>
                              <Input className="h-8 text-xs" value={proj.name} onChange={(e) => {
                                const updated = [...parsedData.projects];
                                updated[idx] = { ...updated[idx], name: e.target.value };
                                setParsedData((prev) => prev ? ({ ...prev, projects: updated }) : prev);
                              }} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] uppercase tracking-wider">URL</Label>
                              <Input className="h-8 text-xs" value={proj.url || ""} onChange={(e) => {
                                const updated = [...parsedData.projects];
                                updated[idx] = { ...updated[idx], url: e.target.value || null };
                                setParsedData((prev) => prev ? ({ ...prev, projects: updated }) : prev);
                              }} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Description</Label>
                            <Textarea className="text-xs" rows={2} value={proj.description} onChange={(e) => {
                              const updated = [...parsedData.projects];
                              updated[idx] = { ...updated[idx], description: e.target.value };
                              setParsedData((prev) => prev ? ({ ...prev, projects: updated }) : prev);
                            }} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider">Tech (comma-separated)</Label>
                            <Input className="h-8 text-xs" value={proj.tech.join(", ")} onChange={(e) => {
                              const updated = [...parsedData.projects];
                              updated[idx] = { ...updated[idx], tech: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) };
                              setParsedData((prev) => prev ? ({ ...prev, projects: updated }) : prev);
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewOpen(false); setParsedData(null); }}>
              Discard
            </Button>
            <Button onClick={saveReviewedResume} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm & Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
