import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import MarketInsight from "@/lib/db/models/market-insight";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { buildMarketAnalysisPrompt } from "@/lib/ai/prompts";

const generateInsightsSchema = z.object({
  role: z.string().min(1, "Target role is required"),
  location: z.string().default(""),
  skills: z.array(z.string()).default([]),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    await connectDB();

    const filter: Record<string, unknown> = { userId: session.user.id };
    const validTypes = ["trend", "salary", "skill-demand", "hiring"];

    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (type) filter.type = type;

    const insights = await MarketInsight.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("[MarketInsights] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = generateInsightsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();

    const aiProvider = await getUserAIProvider(session.user.id);
    if (!aiProvider) {
      return NextResponse.json(
        { error: "No AI API key configured. Please add one in Settings." },
        { status: 400 }
      );
    }

    const messages = buildMarketAnalysisPrompt(
      parsed.data.role,
      parsed.data.location,
      parsed.data.skills
    );

    const result = await aiProvider.generateJSON<{
      insights: {
        type: "trend" | "salary" | "skill-demand" | "hiring";
        title: string;
        data: Record<string, unknown>;
      }[];
      summary: string;
    }>(messages);

    // Get current period (e.g., "2026-W11")
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
    );
    const period = `${now.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;

    // Delete old insights for this user and create new ones
    await MarketInsight.deleteMany({ userId: session.user.id });

    const insightDocs = result.insights.map((insight) => ({
      userId: session.user.id,
      type: insight.type,
      title: insight.title,
      data: insight.data,
      period,
    }));

    const insights = await MarketInsight.insertMany(insightDocs);

    return NextResponse.json({ insights, summary: result.summary }, { status: 201 });
  } catch (error) {
    console.error("[MarketInsights] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
