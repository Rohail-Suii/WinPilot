import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import AIUsageLog from "@/lib/db/models/ai-usage-log";

interface UsageSummaryRow {
  provider: string;
  model: string;
  calls: number;
  totalTokens: number;
  totalCostUsd: number;
}

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId, isGuest } = actor;

    await connectDB();

    const logs = await AIUsageLog.find({ userId, isGuest })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();

    const summaryMap = new Map<string, UsageSummaryRow>();
    for (const row of logs) {
      const key = `${row.provider}::${row.modelId}`;
      const prev = summaryMap.get(key) ?? {
        provider: row.provider,
        model: row.modelId,
        calls: 0,
        totalTokens: 0,
        totalCostUsd: 0,
      };

      prev.calls += 1;
      prev.totalTokens += row.totalTokens ?? 0;
      prev.totalCostUsd += row.costUsd ?? 0;
      summaryMap.set(key, prev);
    }

    const summary = Array.from(summaryMap.values()).sort((a, b) => {
      if (b.calls !== a.calls) return b.calls - a.calls;
      return b.totalTokens - a.totalTokens;
    });

    return NextResponse.json({
      history: logs.map((row) => ({
        id: row._id.toString(),
        provider: row.provider,
        model: row.modelId,
        endpoint: row.endpoint,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        createdAt: row.createdAt,
      })),
      summary,
    });
  } catch (error) {
    console.error("[AIUsageHistory] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
