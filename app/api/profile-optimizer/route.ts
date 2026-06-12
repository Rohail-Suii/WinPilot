import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import ProfileAnalysis from "@/lib/db/models/profile-analysis";
import LinkedInJobOptimization from "@/lib/db/models/linkedin-job-optimization";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

const profileDataSchema = z.object({
  headline: z.string().optional(),
  summary: z.string().optional(),
  experience: z
    .array(
      z.object({
        title: z.string(),
        company: z.string(),
        description: z.string().default(""),
      })
    )
    .optional(),
  skills: z.array(z.string()).optional(),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string(),
        field: z.string().default(""),
      })
    )
    .optional(),
  linkedinUrl: z.string().optional(),
});

const headlineSchema = z.object({
  currentHeadline: z.string().min(1, "Current headline is required"),
  industry: z.string().min(1, "Industry is required"),
  skills: z.array(z.string()).min(1, "At least one skill is required"),
});

const summarySchema = z.object({
  currentSummary: z.string().default(""),
  experience: z.string().min(1, "Experience overview is required"),
  targetRole: z.string().min(1, "Target role is required"),
});

const profileSnapshotSchema = z.object({
  headline: z.string().default(""),
  about: z.string().default(""),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string().default(""),
        company: z.string().default(""),
        duration: z.string().default(""),
        description: z.string().default(""),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string().default(""),
        degree: z.string().default(""),
        field: z.string().default(""),
      })
    )
    .default([]),
  certifications: z
    .array(z.object({ name: z.string().default(""), issuingOrg: z.string().default("") }))
    .default([]),
  featured: z
    .array(z.object({ type: z.string().default(""), title: z.string().default("") }))
    .default([]),
});

const jobOptimizeSchema = z.object({
  profileData: profileSnapshotSchema.optional(),
  profileId: z.string().optional(),
  jobDescription: z.string().min(50, "Job description must be at least 50 characters").max(10000),
});

export async function GET(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "job-optimize-history") {
      const history = await LinkedInJobOptimization.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("-profileSnapshot")
        .lean();
      return NextResponse.json({ history });
    }

    const analysis = await ProfileAnalysis.findOne({ userId: userId })
      .sort({ analyzedAt: -1 })
      .lean();

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("[ProfileOptimizer] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const body = await req.json();

    await connectDB();

    // scrape-profile does not need an AI key — it just stores data from the extension
    if (action === "scrape-profile") {
      const parsed = profileSnapshotSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const doc = await LinkedInJobOptimization.create({
        userId,
        profileSnapshot: parsed.data,
        jobDescription: "",
        analysis: null,
      });

      const profileId = doc._id.toString();

      // Push real-time notification so the UI can react immediately instead of polling
      try {
        const { pushSseEvent } = await import("@/lib/sse");
        pushSseEvent(userId, "profile:ready", { profileId });
      } catch {
        // Best-effort — polling fallback in the UI handles the rest
      }

      return NextResponse.json({ profileId });
    }

    const { getUserAIProvider } = await import("@/lib/ai/key-manager");
    const aiProvider = await getUserAIProvider(userId);
    if (!aiProvider) {
      return NextResponse.json(
        { error: "No AI API key configured. Please add one in Settings." },
        { status: 400 }
      );
    }

    if (action === "analyze") {
      const parsed = profileDataSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const { buildProfileAnalysisPrompt } = await import("@/lib/ai/prompts");
      const messages = buildProfileAnalysisPrompt(parsed.data);
      const result = await aiProvider.generateJSON<{
        overallScore: number;
        sections: {
          headline: { score: number; current: string; suggestion: string };
          summary: { score: number; current: string; suggestion: string };
          experience: { score: number; suggestions: string[] };
          skills: { score: number; missing: string[]; suggestions: string[] };
          education: { score: number };
        };
        recommendations: string[];
      }>(messages);

      const analysis = await ProfileAnalysis.findOneAndUpdate(
        { userId: userId },
        {
          $set: {
            linkedinUrl: parsed.data.linkedinUrl || "",
            overallScore: result.overallScore,
            sections: result.sections,
            recommendations: result.recommendations,
            analyzedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: "after" }
      );

      return NextResponse.json({ analysis });
    }

    if (action === "optimize-headline") {
      const parsed = headlineSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const { buildHeadlineOptimizerPrompt } = await import("@/lib/ai/prompts");
      const messages = buildHeadlineOptimizerPrompt(
        parsed.data.currentHeadline,
        parsed.data.industry,
        parsed.data.skills
      );
      const result = await aiProvider.generateJSON<{
        headlines: { text: string; reasoning: string }[];
      }>(messages);

      return NextResponse.json({ headlines: result.headlines });
    }

    if (action === "optimize-summary") {
      const parsed = summarySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const { buildSummaryOptimizerPrompt } = await import("@/lib/ai/prompts");
      const messages = buildSummaryOptimizerPrompt(
        parsed.data.currentSummary,
        parsed.data.experience,
        parsed.data.targetRole
      );
      const result = await aiProvider.generateJSON<{
        summary: string;
        keyChanges: string[];
        keywordsUsed: string[];
      }>(messages);

      return NextResponse.json({ result });
    }

    if (action === "job-optimize") {
      const parsed = jobOptimizeSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      let profileSnapshot = parsed.data.profileData;

      if (!profileSnapshot && parsed.data.profileId) {
        const existing = await LinkedInJobOptimization.findOne({
          _id: parsed.data.profileId,
          userId,
        }).lean();
        if (!existing) {
          return NextResponse.json({ error: "Profile snapshot not found" }, { status: 404 });
        }
        profileSnapshot = existing.profileSnapshot as unknown as typeof profileSnapshot;
      }

      if (!profileSnapshot) {
        return NextResponse.json(
          { error: "Either profileData or profileId is required" },
          { status: 400 }
        );
      }

      const { buildLinkedInJobOptimizerPrompt } = await import("@/lib/ai/prompts");
      const messages = buildLinkedInJobOptimizerPrompt(profileSnapshot, parsed.data.jobDescription);

      const result = await aiProvider.generateJSON<{
        overallFit: number;
        targetRole: string;
        headline: { current: string; recommended: string; keywords: string[]; reasoning: string };
        about: { current: string; recommended: string; keyChanges: string[] };
        skillsGap: { have: string[]; missing: string[]; quickWins: string[] };
        postIdeas: { topic: string; angle: string; type: string; hashtags: string[]; whyItHelps: string }[];
        certificates: { name: string; provider: string; relevance: string; url?: string }[];
        featuredSuggestions: { type: string; description: string; priority: "high" | "medium" | "low" }[];
      }>(messages);

      const optimization = await LinkedInJobOptimization.findOneAndUpdate(
        parsed.data.profileId ? { _id: parsed.data.profileId, userId } : { userId, jobDescription: "" },
        {
          $set: {
            profileSnapshot,
            jobDescription: parsed.data.jobDescription,
            analysis: result,
          },
        },
        { upsert: true, new: true }
      );

      return NextResponse.json({ optimization });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[ProfileOptimizer] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
