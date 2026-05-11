import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import ProfileAnalysis from "@/lib/db/models/profile-analysis";
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

export async function GET() {
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[ProfileOptimizer] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
