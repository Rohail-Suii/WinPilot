"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  UserCheck,
  Sparkles,
  Copy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Award,
  Lightbulb,
  Target,
  BookOpen,
  Briefcase,
  GraduationCap,
  Download,
  CheckCircle,
  XCircle,
  Zap,
  FileText,
  PenLine,
  TrendingUp,
  Star,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWebSocket } from "@/lib/websocket/client";
import { useExtensionStore } from "@/lib/hooks/use-stores";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------


interface ProfileAnalysis {
  _id: string;
  overallScore: number;
  sections: {
    headline: { score: number; current: string; suggestion: string };
    summary: { score: number; current: string; suggestion: string };
    experience: { score: number; suggestions: string[] };
    skills: { score: number; missing: string[]; suggestions: string[] };
    education: { score: number };
  };
  recommendations: string[];
  analyzedAt: string;
}

interface HeadlineSuggestion {
  text: string;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Job Optimizer Types
// ---------------------------------------------------------------------------

interface ProfileSnapshot {
  headline: string;
  about: string;
  skills: string[];
  experience: { title: string; company: string; duration: string; description: string }[];
  education: { school: string; degree: string; field: string }[];
  certifications: { name: string; issuingOrg: string }[];
  featured: { type: string; title: string }[];
}

interface JobOptimizationAnalysis {
  overallFit: number;
  targetRole: string;
  headline: { current: string; recommended: string; keywords: string[]; reasoning: string };
  about: { current: string; recommended: string; keyChanges: string[] };
  skillsGap: { have: string[]; missing: string[]; quickWins: string[] };
  postIdeas: { topic: string; angle: string; type: string; hashtags: string[]; whyItHelps: string }[];
  certificates: { name: string; provider: string; relevance: string; url?: string }[];
  featuredSuggestions: { type: string; description: string; priority: "high" | "medium" | "low" }[];
}

// ---------------------------------------------------------------------------
// Score Circle Component
// ---------------------------------------------------------------------------

function ScoreCircle({ score, size = 120, label }: { score: number; size?: number; label?: string }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";
  const strokeColor =
    score >= 80 ? "#34d399" : score >= 60 ? "#fbbf24" : "#f87171";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-bold ${color}`}>{score}</span>
        </div>
      </div>
      {label && <p className="text-sm text-white/50">{label}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job Optimizer Tab Component
// ---------------------------------------------------------------------------

function JobOptimizerTab({ copyToClipboard }: { copyToClipboard: (text: string) => void }) {
  const STEP_PROFILE = 1;
  const STEP_JOB = 2;
  const STEP_RESULTS = 3;

  const { sendCommand } = useWebSocket();
  const extensionConnected = useExtensionStore((s) => s.isConnected);

  const [step, setStep] = useState(STEP_PROFILE);
  const [profileData, setProfileData] = useState<Partial<ProfileSnapshot> | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [importingFromLinkedIn, setImportingFromLinkedIn] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<JobOptimizationAnalysis | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const importHandledRef = useRef(false);

  // Manual form state
  const [manualHeadline, setManualHeadline] = useState("");
  const [manualAbout, setManualAbout] = useState("");
  const [manualSkills, setManualSkills] = useState("");
  const [manualExperience, setManualExperience] = useState("");

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // Load last analysis from history on mount so results survive page refresh
  useEffect(() => {
    const loadLastAnalysis = async () => {
      try {
        const res = await fetch("/api/profile-optimizer?action=job-optimize-history");
        const data = await res.json();
        const last = data.history?.[0];
        if (last?.analysis) {
          setAnalysis(last.analysis as JobOptimizationAnalysis);
          setStep(STEP_RESULTS);
        }
      } catch {
        // not critical — user can run a fresh analysis
      }
    };
    loadLastAnalysis();
  }, []);

  const handleImportFromLinkedIn = async () => {
    if (!extensionConnected) {
      toast.error(
        "Extension not connected. Install WinPilot, open LinkedIn, and try again — or use manual input below."
      );
      setShowManualForm(true);
      return;
    }

    setImportingFromLinkedIn(true);
    importHandledRef.current = false;
    toast.info("Requesting profile from extension… Keep your LinkedIn profile tab open.");

    // Trigger via WebSocket — this is the only way to reach the extension service worker.
    // BroadcastChannel cannot cross the browser-extension boundary.
    sendCommand({ type: "START_PROFILE_SCRAPE" });

    // Primary path: SSE event pushed by the server once scrape-profile saves the snapshot
    const es = new EventSource("/api/sse");
    sseRef.current = es;

    es.addEventListener("profile:ready", (e) => {
      if (importHandledRef.current) return;
      importHandledRef.current = true;
      stopPolling(); // clears both the interval and this EventSource
      const payload = JSON.parse(e.data) as { profileId: string };
      setImportingFromLinkedIn(false);
      setProfileId(payload.profileId);
      setProfileData({ headline: "(imported from LinkedIn)" });
      toast.success("LinkedIn profile imported successfully!");
      setStep(STEP_JOB);
    });

    es.addEventListener("error", () => {
      // SSE unavailable — polling below is the fallback
      if (sseRef.current === es) {
        es.close();
        sseRef.current = null;
      }
    });

    // Fallback: poll every 5 s in case SSE is unavailable or the connection dropped
    const triggerTime = Date.now();
    let attempts = 0;
    const MAX_ATTEMPTS = 24; // 2 min

    pollRef.current = setInterval(async () => {
      if (importHandledRef.current) { stopPolling(); return; }
      attempts++;
      try {
        const res = await fetch("/api/profile-optimizer?action=job-optimize-history");
        const data = await res.json();
        const latest = data.history?.[0];
        // Match a fresh snapshot (no analysis yet) created around the time we triggered
        if (
          latest &&
          !latest.analysis &&
          new Date(latest.createdAt).getTime() >= triggerTime - 3000
        ) {
          if (importHandledRef.current) { stopPolling(); return; }
          importHandledRef.current = true;
          stopPolling();
          setImportingFromLinkedIn(false);
          setProfileId(latest._id);
          setProfileData({ headline: "(imported from LinkedIn)" });
          toast.success("LinkedIn profile imported successfully!");
          setStep(STEP_JOB);
          return;
        }
      } catch {
        // silently ignore poll errors
      }

      if (attempts >= MAX_ATTEMPTS) {
        stopPolling();
        setImportingFromLinkedIn(false);
        toast.error("Could not reach extension. Use manual input below instead.");
        setShowManualForm(true);
      }
    }, 5000);
  };

  const handleManualImport = () => {
    const snapshot: Partial<ProfileSnapshot> = {
      headline: manualHeadline,
      about: manualAbout,
      skills: manualSkills ? manualSkills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      experience: manualExperience
        ? [{ title: "Experience summary", company: "", duration: "", description: manualExperience }]
        : [],
    };
    setProfileData(snapshot);
    setProfileId(null);
    toast.success("Profile data saved");
    setStep(STEP_JOB);
  };

  const handleAnalyze = async () => {
    if (!profileData && !profileId) {
      toast.error("Please import or enter your profile first");
      return;
    }
    if (!jobDescription.trim()) {
      toast.error("Please paste a job description");
      return;
    }

    try {
      setAnalyzing(true);
      const res = await fetch("/api/profile-optimizer?action=job-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileData: profileId ? undefined : profileData,
          profileId: profileId || undefined,
          jobDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.optimization?.analysis || null);
      setStep(STEP_RESULTS);
      toast.success("Analysis complete!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleCard = (key: string) =>
    setExpandedCards((prev) => ({ ...prev, [key]: !prev[key] }));

  const priorityColors: Record<string, string> = {
    high: "text-red-400 border-red-400/30",
    medium: "text-amber-400 border-amber-400/30",
    low: "text-emerald-400 border-emerald-400/30",
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { id: STEP_PROFILE, label: "Import Profile" },
          { id: STEP_JOB, label: "Target Job" },
          { id: STEP_RESULTS, label: "Results" },
        ].map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-3 w-3 text-white/20" />}
            <span
              className={`px-2 py-0.5 rounded ${
                step === s.id
                  ? "bg-blue-600 text-white"
                  : step > s.id
                  ? "text-emerald-400"
                  : "text-white/30"
              }`}
            >
              {step > s.id ? <CheckCircle className="inline h-3 w-3 mr-1" /> : null}
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* ── Step 1: Import Profile ── */}
      {step === STEP_PROFILE && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-400" />
              Import Your LinkedIn Profile
            </CardTitle>
            <CardDescription>
              We need your current LinkedIn profile to analyze it against the job.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleImportFromLinkedIn}
              disabled={importingFromLinkedIn}
              className="w-full"
            >
              {importingFromLinkedIn ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {importingFromLinkedIn
                ? "Waiting for extension… (open your LinkedIn profile tab)"
                : "Import from LinkedIn (via Extension)"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-white/40">or enter manually</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full flex items-center justify-between text-sm text-white/50 hover:text-white/80 transition-colors"
              onClick={() => setShowManualForm((v) => !v)}
            >
              <span>Manual input</span>
              {showManualForm ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {showManualForm && (
              <div className="space-y-3 border border-white/10 rounded-lg p-4">
                <div className="space-y-1">
                  <Label>Headline</Label>
                  <Input
                    placeholder="Senior Software Engineer | React | TypeScript"
                    value={manualHeadline}
                    onChange={(e) => setManualHeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>About / Summary</Label>
                  <Textarea
                    placeholder="Your LinkedIn About section…"
                    value={manualAbout}
                    onChange={(e) => setManualAbout(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Skills (comma-separated)</Label>
                  <Input
                    placeholder="React, Node.js, TypeScript, AWS…"
                    value={manualSkills}
                    onChange={(e) => setManualSkills(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Experience summary</Label>
                  <Textarea
                    placeholder="e.g., 4 years full-stack development, built e-commerce platform for 500k users…"
                    value={manualExperience}
                    onChange={(e) => setManualExperience(e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
                <Button onClick={handleManualImport} className="w-full">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Use This Profile
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Target Job ── */}
      {step === STEP_JOB && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-400" />
              Paste the Job Description
            </CardTitle>
            <CardDescription>
              {profileId
                ? "Profile imported from LinkedIn."
                : profileData?.headline
                ? `Profile loaded: "${profileData.headline}"`
                : "Profile loaded."}
              {" "}Now paste the job description you want to target.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Job Description</Label>
                <span className="text-xs text-white/30">{jobDescription.length}/5000</span>
              </div>
              <Textarea
                placeholder="Paste the full job description here — include responsibilities, requirements, and skills…"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value.slice(0, 5000))}
                className="min-h-[200px]"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep(STEP_PROFILE)}
                className="shrink-0"
              >
                Back
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={analyzing || !jobDescription.trim()}
                className="flex-1"
              >
                {analyzing ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {analyzing ? "Analyzing…" : "Optimize for this Job"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Results ── */}
      {step === STEP_RESULTS && analysis && (
        <div className="space-y-4">
          {/* Header controls */}
          <div className="flex items-center justify-between">
            <h3 className="text-white font-medium">
              Optimization results for: <span className="text-blue-400">{analysis.targetRole}</span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setStep(STEP_JOB); setAnalysis(null); }}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Re-analyze
            </Button>
          </div>

          {/* Overall fit score */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <ScoreCircle score={analysis.overallFit} size={120} label="Job Fit Score" />
                <div className="flex-1">
                  <h4 className="text-white font-medium mb-2">Profile-to-Job Match</h4>
                  <p className="text-white/50 text-sm">
                    {analysis.overallFit >= 80
                      ? "Strong match. Make the targeted tweaks below to lock it in."
                      : analysis.overallFit >= 55
                      ? "Decent fit. Filling the skills gap and updating your headline will significantly improve your chances."
                      : "Gap is large but bridgeable. Follow all recommendations, especially the skills and certifications."}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {analysis.headline.keywords.slice(0, 6).map((kw, i) => (
                      <Badge key={i} variant="info">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Headline card */}
          <Card>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggleCard("headline")}
              >
                <div className="flex items-center gap-3">
                  <PenLine className="h-4 w-4 text-blue-400" />
                  <span className="text-white font-medium">Headline</span>
                </div>
                {expandedCards.headline ? (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/40" />
                )}
              </button>
              {expandedCards.headline && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-white/40">Current</p>
                      <p className="text-sm text-white/60 bg-white/5 rounded p-2">
                        {analysis.headline.current || "(not provided)"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-400">Recommended</p>
                      <div className="flex items-start gap-2 bg-emerald-500/10 rounded p-2">
                        <p className="text-sm text-white flex-1">{analysis.headline.recommended}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => copyToClipboard(analysis.headline.recommended)}
                        >
                          <Copy className="h-3 w-3 text-white/40" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-white/40">{analysis.headline.reasoning}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* About/Summary card */}
          <Card>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggleCard("about")}
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="h-4 w-4 text-purple-400" />
                  <span className="text-white font-medium">About / Summary</span>
                </div>
                {expandedCards.about ? (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/40" />
                )}
              </button>
              {expandedCards.about && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-4">
                  <div className="flex items-start justify-between gap-2 bg-emerald-500/10 rounded p-3">
                    <p className="text-sm text-white/80 whitespace-pre-wrap flex-1">
                      {analysis.about.recommended}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyToClipboard(analysis.about.recommended)}
                    >
                      <Copy className="h-3 w-3 text-white/40" />
                    </Button>
                  </div>
                  {analysis.about.keyChanges.length > 0 && (
                    <div>
                      <p className="text-xs text-white/40 mb-2">Key changes made</p>
                      <ul className="space-y-1">
                        {analysis.about.keyChanges.map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-white/50">
                            <span className="text-blue-400 mt-0.5">→</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills Gap card */}
          <Card>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggleCard("skills")}
              >
                <div className="flex items-center gap-3">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-white font-medium">Skills Gap</span>
                  <Badge variant="warning">{analysis.skillsGap.missing.length} missing</Badge>
                </div>
                {expandedCards.skills ? (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/40" />
                )}
              </button>
              {expandedCards.skills && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> You have
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.skillsGap.have.map((s, i) => (
                          <Badge key={i} variant="success">{s}</Badge>
                        ))}
                        {analysis.skillsGap.have.length === 0 && (
                          <p className="text-xs text-white/30">None matched</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Missing
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.skillsGap.missing.map((s, i) => (
                          <Badge key={i} variant="error">{s}</Badge>
                        ))}
                        {analysis.skillsGap.missing.length === 0 && (
                          <p className="text-xs text-white/30">None!</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-amber-400 mb-2 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> Quick wins
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.skillsGap.quickWins.map((s, i) => (
                          <Badge key={i} variant="warning">{s}</Badge>
                        ))}
                        {analysis.skillsGap.quickWins.length === 0 && (
                          <p className="text-xs text-white/30">None</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Post Ideas card */}
          <Card>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggleCard("posts")}
              >
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-4 w-4 text-blue-400" />
                  <span className="text-white font-medium">Post Ideas</span>
                  <Badge variant="info">{analysis.postIdeas.length} ideas</Badge>
                </div>
                {expandedCards.posts ? (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/40" />
                )}
              </button>
              {expandedCards.posts && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3">
                  {analysis.postIdeas.map((idea, i) => (
                    <div key={i} className="border border-white/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm text-white font-medium">{idea.topic}</p>
                          <p className="text-xs text-white/50 mt-0.5">{idea.angle}</p>
                        </div>
                        <Badge variant="info">{idea.type}</Badge>
                      </div>
                      <p className="text-xs text-emerald-400">{idea.whyItHelps}</p>
                      <div className="flex flex-wrap gap-1">
                        {idea.hashtags.map((h, j) => (
                          <span key={j} className="text-xs text-blue-400/70">#{h}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Certificates & Featured combined card */}
          <Card>
            <CardContent className="p-0">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => toggleCard("certs")}
              >
                <div className="flex items-center gap-3">
                  <Award className="h-4 w-4 text-yellow-400" />
                  <span className="text-white font-medium">Certifications & Featured</span>
                </div>
                {expandedCards.certs ? (
                  <ChevronDown className="h-4 w-4 text-white/40" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-white/40" />
                )}
              </button>
              {expandedCards.certs && (
                <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-5">
                  {/* Certificates */}
                  <div>
                    <p className="text-xs text-white/40 mb-3 uppercase tracking-wide">
                      Recommended Certifications
                    </p>
                    <div className="space-y-2">
                      {analysis.certificates.map((cert, i) => (
                        <div key={i} className="flex items-start gap-3 border border-white/10 rounded-lg p-3">
                          <Star className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-white font-medium">{cert.name}</p>
                              <p className="text-xs text-white/40">{cert.provider}</p>
                            </div>
                            <p className="text-xs text-white/50 mt-0.5">{cert.relevance}</p>
                          </div>
                          {cert.url && (
                            <a
                              href={cert.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-blue-400 hover:text-blue-300"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Featured suggestions */}
                  <div>
                    <p className="text-xs text-white/40 mb-3 uppercase tracking-wide">
                      Featured Section Suggestions
                    </p>
                    <div className="space-y-2">
                      {analysis.featuredSuggestions.map((sug, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-3 border rounded-lg p-3 ${priorityColors[sug.priority]}`}
                        >
                          <Target className="h-4 w-4 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="info">{sug.type}</Badge>
                              <span className={`text-xs capitalize font-medium ${priorityColors[sug.priority].split(" ")[0]}`}>
                                {sug.priority} priority
                              </span>
                            </div>
                            <p className="text-sm text-white/70 mt-1">{sug.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ProfileOptimizerClient() {
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Analyze form state
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");

  // Headline optimizer state
  const [headlineSuggestions, setHeadlineSuggestions] = useState<HeadlineSuggestion[]>([]);
  const [optimizingHeadline, setOptimizingHeadline] = useState(false);
  const [headlineIndustry, setHeadlineIndustry] = useState("");
  const [headlineSkills, setHeadlineSkills] = useState("");

  // Summary optimizer state
  const [optimizingSummary, setOptimizingSummary] = useState(false);
  const [summaryExperience, setSummaryExperience] = useState("");
  const [summaryTargetRole, setSummaryTargetRole] = useState("");
  const [optimizedSummary, setOptimizedSummary] = useState<{ summary: string; keyChanges: string[]; keywordsUsed: string[] } | null>(null);

  const fetchAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/profile-optimizer");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load analysis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);
      const profileData = {
        headline: headline || undefined,
        summary: summary || undefined,
        skills: skills ? skills.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };

      const res = await fetch("/api/profile-optimizer?action=analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      toast.success("Profile analyzed successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to analyze profile");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOptimizeHeadline = async () => {
    if (!headline && !analysis?.sections.headline.current) {
      toast.error("Please provide your current headline");
      return;
    }
    try {
      setOptimizingHeadline(true);
      const res = await fetch("/api/profile-optimizer?action=optimize-headline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentHeadline: headline || analysis?.sections.headline.current || "",
          industry: headlineIndustry || "Technology",
          skills: headlineSkills ? headlineSkills.split(",").map((s) => s.trim()).filter(Boolean) : ["Professional"],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHeadlineSuggestions(data.headlines || []);
      toast.success("Headlines generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to optimize headline");
    } finally {
      setOptimizingHeadline(false);
    }
  };

  const handleOptimizeSummary = async () => {
    try {
      setOptimizingSummary(true);
      const res = await fetch("/api/profile-optimizer?action=optimize-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentSummary: summary || analysis?.sections.summary.current || "",
          experience: summaryExperience || "Not specified",
          targetRole: summaryTargetRole || "Not specified",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOptimizedSummary(data.result);
      toast.success("Summary optimized");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to optimize summary");
    } finally {
      setOptimizingSummary(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const sectionIcons: Record<string, React.ReactNode> = {
    headline: <Target className="h-4 w-4" />,
    summary: <BookOpen className="h-4 w-4" />,
    experience: <Briefcase className="h-4 w-4" />,
    skills: <Lightbulb className="h-4 w-4" />,
    education: <GraduationCap className="h-4 w-4" />,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile Optimizer</h1>
          <p className="text-white/50 mt-1">
            AI-powered LinkedIn profile analysis and optimization
          </p>
        </div>
        <Button onClick={fetchAnalysis} variant="ghost" size="sm">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
          <TabsTrigger value="headline">Headline</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="job-optimizer">Job Optimizer</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {!analysis ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <UserCheck className="h-16 w-16 text-white/20 mb-4" />
                <h3 className="text-white font-medium text-lg mb-2">No Analysis Yet</h3>
                <p className="text-white/50 text-center mb-6 max-w-md">
                  Analyze your LinkedIn profile to get a detailed score and AI-powered suggestions for improvement.
                </p>
                <Button onClick={() => setActiveTab("analyze")}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze Your Profile
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Overall Score */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <ScoreCircle score={analysis.overallScore} size={140} label="Overall Score" />
                    <div className="flex-1">
                      <h3 className="text-white font-medium text-lg mb-2">Profile Assessment</h3>
                      <p className="text-white/50 mb-4">
                        {analysis.overallScore >= 80
                          ? "Excellent! Your profile is well-optimized."
                          : analysis.overallScore >= 60
                          ? "Good profile, but there is room for improvement."
                          : "Your profile needs significant improvements to stand out."}
                      </p>
                      <p className="text-xs text-white/30">
                        Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Section Scores */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {(["headline", "summary", "experience", "skills", "education"] as const).map(
                  (section) => (
                    <Card key={section}>
                      <CardContent className="p-4 flex flex-col items-center">
                        <ScoreCircle
                          score={analysis.sections[section].score}
                          size={80}
                        />
                        <p className="text-sm text-white/70 mt-2 capitalize flex items-center gap-1">
                          {sectionIcons[section]} {section}
                        </p>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>

              {/* Detailed Sections */}
              <div className="space-y-3">
                {(["headline", "summary", "experience", "skills"] as const).map((section) => {
                  const s = analysis.sections[section];
                  const isExpanded = expandedSections[section];
                  return (
                    <Card key={section}>
                      <CardContent className="p-0">
                        <button
                          className="w-full flex items-center justify-between p-4 text-left cursor-pointer"
                          onClick={() => toggleSection(section)}
                        >
                          <div className="flex items-center gap-3">
                            {sectionIcons[section]}
                            <span className="text-white font-medium capitalize">{section}</span>
                            <Badge variant={s.score >= 70 ? "success" : s.score >= 50 ? "warning" : "error"}>
                              {s.score}/100
                            </Badge>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-white/40" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-white/40" />
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-white/5 pt-4 space-y-3">
                            {"current" in s && s.current && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Current</p>
                                <p className="text-sm text-white/70">{s.current}</p>
                              </div>
                            )}
                            {"suggestion" in s && s.suggestion && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Suggestion</p>
                                <div className="flex items-start gap-2">
                                  <p className="text-sm text-emerald-400 flex-1">{s.suggestion}</p>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => copyToClipboard(s.suggestion!)}
                                  >
                                    <Copy className="h-3 w-3 text-white/40" />
                                  </Button>
                                </div>
                              </div>
                            )}
                            {"suggestions" in s && s.suggestions && s.suggestions.length > 0 && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Suggestions</p>
                                <ul className="space-y-1">
                                  {s.suggestions.map((sug, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                                      <span className="text-emerald-400 mt-0.5">-</span>
                                      <span className="flex-1">{sug}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0"
                                        onClick={() => copyToClipboard(sug)}
                                      >
                                        <Copy className="h-3 w-3 text-white/40" />
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {"missing" in s && s.missing && s.missing.length > 0 && (
                              <div>
                                <p className="text-xs text-white/40 mb-1">Missing Skills</p>
                                <div className="flex flex-wrap gap-2">
                                  {s.missing.map((skill, i) => (
                                    <Badge key={i} variant="warning">{skill}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-blue-400" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/70">
                          <span className="text-blue-400 font-medium">{i + 1}.</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Analyze Tab */}
        <TabsContent value="analyze">
          <Card>
            <CardHeader>
              <CardTitle>Analyze Your Profile</CardTitle>
              <CardDescription>
                Enter your LinkedIn profile information to get an AI-powered analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headline">Current Headline</Label>
                <Input
                  id="headline"
                  placeholder="e.g., Senior Software Engineer | React | Node.js"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Current Summary/About</Label>
                <Textarea
                  id="summary"
                  placeholder="Your LinkedIn About section..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma-separated)</Label>
                <Input
                  id="skills"
                  placeholder="React, Node.js, TypeScript, Python..."
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                />
              </div>
              <Button onClick={handleAnalyze} disabled={analyzing} className="w-full">
                {analyzing ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {analyzing ? "Analyzing..." : "Analyze Profile"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Headline Tab */}
        <TabsContent value="headline">
          <Card>
            <CardHeader>
              <CardTitle>Headline Optimizer</CardTitle>
              <CardDescription>
                Generate optimized LinkedIn headlines tailored to your industry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Headline</Label>
                <Input
                  placeholder="Your current LinkedIn headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input
                  placeholder="e.g., Technology, Finance, Healthcare"
                  value={headlineIndustry}
                  onChange={(e) => setHeadlineIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Key Skills (comma-separated)</Label>
                <Input
                  placeholder="React, Leadership, Data Analysis..."
                  value={headlineSkills}
                  onChange={(e) => setHeadlineSkills(e.target.value)}
                />
              </div>
              <Button onClick={handleOptimizeHeadline} disabled={optimizingHeadline} className="w-full">
                {optimizingHeadline ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {optimizingHeadline ? "Generating..." : "Generate Headlines"}
              </Button>

              {headlineSuggestions.length > 0 && (
                <div className="space-y-3 mt-4">
                  <h4 className="text-white font-medium">Suggested Headlines</h4>
                  {headlineSuggestions.map((hl, i) => (
                    <div key={i} className="border border-white/10 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white font-medium text-sm">{hl.text}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => copyToClipboard(hl.text)}
                        >
                          <Copy className="h-3 w-3 text-white/40" />
                        </Button>
                      </div>
                      <p className="text-xs text-white/40 mt-1">{hl.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Summary Optimizer</CardTitle>
              <CardDescription>
                Get an AI-optimized LinkedIn About section.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Summary</Label>
                <Textarea
                  placeholder="Your current LinkedIn About section..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Experience Overview</Label>
                <Input
                  placeholder="e.g., 5 years in full-stack development, led teams of 10+"
                  value={summaryExperience}
                  onChange={(e) => setSummaryExperience(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Target Role</Label>
                <Input
                  placeholder="e.g., Senior Engineering Manager"
                  value={summaryTargetRole}
                  onChange={(e) => setSummaryTargetRole(e.target.value)}
                />
              </div>
              <Button onClick={handleOptimizeSummary} disabled={optimizingSummary} className="w-full">
                {optimizingSummary ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {optimizingSummary ? "Optimizing..." : "Optimize Summary"}
              </Button>

              {optimizedSummary && (
                <div className="space-y-4 mt-4">
                  <div className="border border-white/10 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-white font-medium">Optimized Summary</h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(optimizedSummary.summary)}
                      >
                        <Copy className="h-4 w-4 text-white/40" />
                      </Button>
                    </div>
                    <p className="text-sm text-white/70 whitespace-pre-wrap">
                      {optimizedSummary.summary}
                    </p>
                  </div>
                  {optimizedSummary.keyChanges.length > 0 && (
                    <div>
                      <h4 className="text-white font-medium text-sm mb-2">Key Changes</h4>
                      <ul className="space-y-1">
                        {optimizedSummary.keyChanges.map((change, i) => (
                          <li key={i} className="text-sm text-white/50 flex items-start gap-2">
                            <span className="text-emerald-400">-</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {optimizedSummary.keywordsUsed.length > 0 && (
                    <div>
                      <h4 className="text-white font-medium text-sm mb-2">Keywords Used</h4>
                      <div className="flex flex-wrap gap-2">
                        {optimizedSummary.keywordsUsed.map((kw, i) => (
                          <Badge key={i} variant="info">{kw}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Job Optimizer Tab */}
        <TabsContent value="job-optimizer">
          <JobOptimizerTab copyToClipboard={copyToClipboard} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
