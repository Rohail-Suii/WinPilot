"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
      </Tabs>
    </div>
  );
}
