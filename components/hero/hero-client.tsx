"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Trophy,
  Sparkles,
  Send,
  Trash2,
  Loader2,
  Clock,
  FileText,
  Wand2,
  Plus,
  Calendar,
  Hash,
  BarChart3,
  Users,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  CalendarDays,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { heroProfileSchema, type HeroProfileInput } from "@/lib/validators";

interface HeroProfileData {
  _id: string;
  niche: string;
  targetAudience: string;
  contentPillars: string[];
  voiceTone: string;
  postingSchedule: {
    days: number[];
    timesPerWeek: number;
    preferredTimes: string[];
  };
  groups?: { name: string; url: string; memberCount?: number; relevanceScore?: number }[];
}

interface PostItem {
  _id: string;
  content: string;
  type: string;
  status: string;
  hashtags: string[];
  targetGroups?: string[];
  scheduledFor?: string;
  postedAt?: string;
  linkedinPostUrl?: string;
  engagement?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    impressions?: number;
  };
  createdAt: string;
}

interface HeroStats {
  totalPosts: number;
  thisWeek: number;
  thisMonth: number;
  engagement: {
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    avgViews: number;
  };
}

export function HeroClient() {
  const [activeTab, setActiveTab] = useState("profile");
  const [profile, setProfile] = useState<HeroProfileData | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<PostItem[]>([]);
  const [stats, setStats] = useState<HeroStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/hero");
    if (res.ok) {
      const data = await res.json();
      setProfile(data.profile);
    }
  }, []);

  const fetchPosts = useCallback(async () => {
    const res = await fetch("/api/hero?view=posts");
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
    }
  }, []);

  const fetchScheduled = useCallback(async () => {
    const res = await fetch("/api/hero?view=scheduled");
    if (res.ok) {
      const data = await res.json();
      setScheduledPosts(data.posts);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/hero?view=stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProfile(), fetchPosts(), fetchScheduled(), fetchStats()]).then(() =>
      setLoading(false)
    );
  }, [fetchProfile, fetchPosts, fetchScheduled, fetchStats]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Become a Hero</h2>
        <p className="text-white/50 mt-1">Build your LinkedIn presence with AI-powered content</p>
      </div>

      {/* Stats Overview */}
      {stats && <HeroStatsCards stats={stats} />}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="profile"><Trophy className="h-4 w-4 mr-2" />Profile</TabsTrigger>
          <TabsTrigger value="create"><Wand2 className="h-4 w-4 mr-2" />Create</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarDays className="h-4 w-4 mr-2" />Calendar ({scheduledPosts.length})</TabsTrigger>
          <TabsTrigger value="posts"><FileText className="h-4 w-4 mr-2" />Posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="groups"><Users className="h-4 w-4 mr-2" />Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <HeroProfileTab profile={profile} loading={loading} onSave={fetchProfile} />
        </TabsContent>
        <TabsContent value="create">
          <ContentCreator profile={profile} onCreated={() => { fetchPosts(); fetchScheduled(); }} />
        </TabsContent>
        <TabsContent value="calendar">
          <ContentCalendar posts={scheduledPosts} loading={loading} onRefresh={() => { fetchScheduled(); fetchPosts(); }} />
        </TabsContent>
        <TabsContent value="posts">
          <PostsList posts={posts} loading={loading} onDelete={fetchPosts} />
        </TabsContent>
        <TabsContent value="groups">
          <GroupManager profile={profile} onSave={fetchProfile} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Stats Cards ────────────────────────────────
function HeroStatsCards({ stats }: { stats: HeroStats }) {
  const statItems = [
    { label: "Total Posts", value: stats.totalPosts, icon: FileText, color: "text-blue-400" },
    { label: "This Week", value: stats.thisWeek, icon: TrendingUp, color: "text-emerald-400" },
    { label: "Total Views", value: stats.engagement.totalViews, icon: Eye, color: "text-purple-400" },
    { label: "Total Likes", value: stats.engagement.totalLikes, icon: Heart, color: "text-rose-400" },
    { label: "Comments", value: stats.engagement.totalComments, icon: MessageCircle, color: "text-amber-400" },
    { label: "Shares", value: stats.engagement.totalShares, icon: Share2, color: "text-cyan-400" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {statItems.map((item) => (
        <Card key={item.label} className="hover:border-white/20 transition-colors">
          <CardContent className="p-4 text-center">
            <item.icon className={`h-5 w-5 mx-auto mb-1.5 ${item.color}`} />
            <p className="text-lg font-bold text-white">{item.value.toLocaleString()}</p>
            <p className="text-[11px] text-white/40">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Profile Tab ────────────────────────────────
function HeroProfileTab({
  profile,
  loading,
  onSave,
}: {
  profile: HeroProfileData | null;
  loading: boolean;
  onSave: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [pillars, setPillars] = useState<string[]>(profile?.contentPillars || []);
  const [pillarInput, setPillarInput] = useState("");

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<HeroProfileInput>({
    resolver: zodResolver(heroProfileSchema),
    defaultValues: {
      niche: profile?.niche || "",
      targetAudience: profile?.targetAudience || "",
      contentPillars: profile?.contentPillars || [],
      voiceTone: (profile?.voiceTone as HeroProfileInput["voiceTone"]) || "professional",
      postingSchedule: profile?.postingSchedule || {
        days: [1, 3, 5],
        timesPerWeek: 3,
        preferredTimes: ["09:00"],
      },
    },
  });

  useEffect(() => {
    if (profile) {
      setPillars(profile.contentPillars);
      setValue("niche", profile.niche);
      setValue("targetAudience", profile.targetAudience);
      setValue("contentPillars", profile.contentPillars);
      setValue("voiceTone", profile.voiceTone as HeroProfileInput["voiceTone"]);
      setValue("postingSchedule", profile.postingSchedule);
    }
  }, [profile, setValue]);

  const addPillar = () => {
    const trimmed = pillarInput.trim();
    if (trimmed && pillars.length < 5 && !pillars.includes(trimmed)) {
      const next = [...pillars, trimmed];
      setPillars(next);
      setValue("contentPillars", next);
      setPillarInput("");
    }
  };

  const removePillar = (index: number) => {
    const next = pillars.filter((_, i) => i !== index);
    setPillars(next);
    setValue("contentPillars", next);
  };

  const onSubmit = async (data: HeroProfileInput) => {
    setSaving(true);
    const res = await fetch("/api/hero?action=profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Hero profile saved");
      onSave();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to save");
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/5" />)}</div>;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hero Profile</CardTitle>
        <CardDescription>Define your LinkedIn content strategy. The AI will use these settings to generate tailored content.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 max-w-lg">
          <div className="space-y-2">
            <Label>Your Niche</Label>
            <Input placeholder="e.g., Full-Stack Development, SaaS Marketing" {...register("niche")} />
            {errors.niche && <p className="text-xs text-red-400">{errors.niche.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Input placeholder="e.g., CTOs, startup founders, hiring managers" {...register("targetAudience")} />
            {errors.targetAudience && <p className="text-xs text-red-400">{errors.targetAudience.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Content Pillars (max 5)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Career tips"
                value={pillarInput}
                onChange={(e) => setPillarInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPillar(); } }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addPillar} disabled={pillars.length >= 5}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {pillars.map((p, i) => (
                <Badge key={i} variant="info" className="gap-1 cursor-pointer" onClick={() => removePillar(i)}>
                  {p} ×
                </Badge>
              ))}
            </div>
            {errors.contentPillars && <p className="text-xs text-red-400">{errors.contentPillars.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Voice & Tone</Label>
            <Select {...register("voiceTone")}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="inspirational">Inspirational</option>
              <option value="educational">Educational</option>
              <option value="humorous">Humorous</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Posting Days</Label>
            <div className="flex gap-2">
              {dayNames.map((day, i) => {
                const currentDays = profile?.postingSchedule?.days || [1, 3, 5];
                const isSelected = currentDays.includes(i);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected ? "bg-purple-500 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : "Save Profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Content Creator ────────────────────────────
function ContentCreator({
  profile,
  onCreated,
}: {
  profile: HeroProfileData | null;
  onCreated: () => void;
}) {
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hashtags, setHashtags] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [postType, setPostType] = useState("text");
  const [variants, setVariants] = useState<string[]>([]);

  const generate = async () => {
    if (!profile) {
      toast.error("Please set up your hero profile first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/hero?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        const generated = data.generated;
        setContent(generated.content);
        if (generated.hashtags?.length) {
          setHashtags(generated.hashtags.join(", "));
        }
        if (generated.postType) {
          setPostType(generated.postType);
        }
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to generate");
      }
    } catch {
      toast.error("Failed to generate content");
    }
    setGenerating(false);
  };

  const generateVariants = async () => {
    if (!profile) return;
    setGenerating(true);
    try {
      const results: string[] = [];
      for (let i = 0; i < 2; i++) {
        const res = await fetch("/api/hero?action=generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic || undefined }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push(data.generated.content);
        }
      }
      setVariants(results);
      toast.success(`Generated ${results.length} variants`);
    } catch {
      toast.error("Failed to generate variants");
    }
    setGenerating(false);
  };

  const savePost = async (status: "draft" | "scheduled") => {
    if (!content.trim()) {
      toast.error("Content is required");
      return;
    }
    if (status === "scheduled" && !scheduleDate) {
      toast.error("Please select a schedule date");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/hero?action=post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        type: postType,
        hashtags: hashtags
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean),
        scheduledFor: status === "scheduled" ? scheduleDate : undefined,
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success(status === "draft" ? "Saved as draft" : "Scheduled for posting");
      setContent("");
      setHashtags("");
      setTopic("");
      setScheduleDate("");
      setVariants([]);
      onCreated();
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to save post");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Content Creator</CardTitle>
              <CardDescription>Generate LinkedIn posts with AI based on your hero profile</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Topic input */}
          <div className="space-y-2">
            <Label>Topic (optional)</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter a topic or leave empty for AI to choose from your pillars"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={generate} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Sparkles className="h-4 w-4" />Generate</>
                )}
              </Button>
              <Button variant="ghost" onClick={generateVariants} disabled={generating} title="Generate A/B variants">
                <BarChart3 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* A/B Variants */}
          {variants.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-white/50">A/B Variants — click to use</Label>
              <div className="grid gap-2 md:grid-cols-2">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setContent(v);
                      setVariants([]);
                    }}
                    className="text-left rounded-xl bg-white/5 border border-white/10 p-3 hover:border-blue-500/50 transition-colors text-xs text-white/70 line-clamp-4"
                  >
                    <Badge variant="info" className="mb-1.5">Variant {String.fromCharCode(65 + i)}</Badge>
                    <p className="whitespace-pre-wrap">{v}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Post type */}
          <div className="flex items-center gap-3">
            <Label className="text-xs text-white/50">Type:</Label>
            <Select value={postType} onChange={(e) => setPostType(e.target.value)}>
              <option value="text">Text Post</option>
              <option value="carousel">Carousel Outline</option>
              <option value="poll">Poll</option>
              <option value="article">Article</option>
            </Select>
          </div>

          <Textarea
            placeholder={
              profile
                ? "Click Generate to create AI content, or write your own post..."
                : "Set up your hero profile first to use AI generation"
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
          />

          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-white/40" />
            <Input
              placeholder="hashtags (comma separated, max 5)"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Schedule date */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-white/40" />
            <Input
              type="datetime-local"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-white/30">
            <span>{content.length} characters</span>
            <span>·</span>
            <span>~{Math.ceil(content.length / 200)} min read</span>
            {content.length > 0 && content.length < 1000 && (
              <span className="text-amber-400/60">LinkedIn optimal: 1000-3000 chars</span>
            )}
            {content.length >= 1000 && content.length <= 3000 && (
              <span className="text-emerald-400/60">Great length for engagement!</span>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={() => savePost("draft")} disabled={saving || !content.trim()} variant="outline">
              <FileText className="h-4 w-4" />Save Draft
            </Button>
            <Button onClick={() => savePost("scheduled")} disabled={saving || !content.trim()}>
              <Send className="h-4 w-4" />{scheduleDate ? "Schedule Post" : "Queue Post"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Content Calendar ───────────────────────────
function ContentCalendar({
  posts,
  loading,
  onRefresh,
}: {
  posts: PostItem[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const deletePost = async (id: string) => {
    await fetch(`/api/hero?id=${id}`, { method: "DELETE" });
    toast.success("Scheduled post removed");
    onRefresh();
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CalendarDays className="h-10 w-10 text-white/20" />
        <p className="text-white/40 text-sm mt-4">No scheduled posts</p>
        <p className="text-white/25 text-xs mt-1">Schedule posts from the Create tab</p>
      </div>
    );
  }

  // Group posts by date
  const grouped = posts.reduce<Record<string, PostItem[]>>((acc, post) => {
    const date = post.scheduledFor
      ? new Date(post.scheduledFor).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })
      : "Unscheduled";
    if (!acc[date]) acc[date] = [];
    acc[date].push(post);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, datePosts]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {date}
          </h3>
          <div className="space-y-3">
            {datePosts.map((post) => (
              <Card key={post._id} className="hover:border-white/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">
                          <Clock className="h-3 w-3 mr-1" />
                          {post.scheduledFor
                            ? new Date(post.scheduledFor).toLocaleTimeString("en-US", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Queued"}
                        </Badge>
                        <Badge variant="default">{post.type}</Badge>
                      </div>
                      <p className="text-sm text-white/80 line-clamp-2 whitespace-pre-wrap">
                        {post.content}
                      </p>
                      {post.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {post.hashtags.map((tag, i) => (
                            <span key={i} className="text-xs text-blue-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deletePost(post._id)}>
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Group Manager ──────────────────────────────
function GroupManager({
  profile,
  onSave,
}: {
  profile: HeroProfileData | null;
  onSave: () => void;
}) {
  const [groups, setGroups] = useState(profile?.groups || []);
  const [saving, setSaving] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", url: "" });

  useEffect(() => {
    if (profile?.groups) setGroups(profile.groups);
  }, [profile]);

  const addGroup = () => {
    if (!newGroup.name.trim() || !newGroup.url.trim()) {
      toast.error("Group name and URL are required");
      return;
    }
    setGroups((prev) => [...prev, { ...newGroup, memberCount: 0, relevanceScore: 0 }]);
    setNewGroup({ name: "", url: "" });
  };

  const removeGroup = (index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  };

  const saveGroups = async () => {
    setSaving(true);
    const res = await fetch("/api/hero?action=groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Groups saved");
      onSave();
    } else {
      toast.error("Failed to save groups");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>LinkedIn Groups</CardTitle>
          <CardDescription>
            Manage groups for cross-posting content. Max 3 groups per post for safety.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Group name"
              value={newGroup.name}
              onChange={(e) => setNewGroup((prev) => ({ ...prev, name: e.target.value }))}
              className="flex-1"
            />
            <Input
              placeholder="LinkedIn group URL"
              value={newGroup.url}
              onChange={(e) => setNewGroup((prev) => ({ ...prev, url: e.target.value }))}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={addGroup}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="h-8 w-8 text-white/20" />
              <p className="text-white/40 text-sm mt-3">No groups added</p>
              <p className="text-white/25 text-xs mt-1">
                Add LinkedIn groups to enable cross-posting
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{group.name}</p>
                    <p className="text-xs text-white/40 truncate">{group.url}</p>
                  </div>
                  {group.memberCount ? (
                    <Badge variant="default" className="mr-3">
                      {group.memberCount.toLocaleString()} members
                    </Badge>
                  ) : null}
                  <Button variant="ghost" size="icon" onClick={() => removeGroup(i)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <Button onClick={saveGroups} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save Groups"
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Posts List ──────────────────────────────────
function PostsList({
  posts,
  loading,
  onDelete,
}: {
  posts: PostItem[];
  loading: boolean;
  onDelete: () => void;
}) {
  const deletePost = async (id: string) => {
    await fetch(`/api/hero?id=${id}`, { method: "DELETE" });
    toast.success("Post deleted");
    onDelete();
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-10 w-10 text-white/20" />
        <p className="text-white/40 text-sm mt-4">No posts yet</p>
        <p className="text-white/25 text-xs mt-1">Create content in the Create tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <Card key={post._id} className="hover:border-white/20 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      post.status === "posted"
                        ? "success"
                        : post.status === "scheduled"
                        ? "warning"
                        : "default"
                    }
                  >
                    {post.status}
                  </Badge>
                  <Badge variant="default">{post.type}</Badge>
                  <span className="text-xs text-white/30">
                    {new Date(post.postedAt || post.createdAt).toLocaleDateString()}
                  </span>
                  {post.linkedinPostUrl && (
                    <a
                      href={post.linkedinPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline"
                    >
                      View on LinkedIn
                    </a>
                  )}
                </div>
                <p className="text-sm text-white/80 line-clamp-3 whitespace-pre-wrap">
                  {post.content}
                </p>
                {post.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs text-blue-400">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Engagement stats */}
                {post.engagement &&
                  (post.engagement.views > 0 ||
                    post.engagement.likes > 0 ||
                    post.engagement.comments > 0) && (
                    <div className="flex items-center gap-4 pt-1">
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {post.engagement.views.toLocaleString()}
                      </span>
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Heart className="h-3 w-3" />
                        {post.engagement.likes}
                      </span>
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" />
                        {post.engagement.comments}
                      </span>
                      <span className="text-xs text-white/40 flex items-center gap-1">
                        <Share2 className="h-3 w-3" />
                        {post.engagement.shares}
                      </span>
                    </div>
                  )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => deletePost(post._id)}>
                <Trash2 className="h-4 w-4 text-red-400" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
