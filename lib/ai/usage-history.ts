import connectDB from "@/lib/db/connection";
import AIUsageLog from "@/lib/db/models/ai-usage-log";
import type { AIProvider } from "@/lib/ai/provider";

export interface AIResponseMetadata {
  provider: string;
  model: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  } | null;
}

export function buildAIMetadata(ai: AIProvider | null): AIResponseMetadata | null {
  if (!ai) return null;

  const usage = ai.getLastUsage?.() ?? null;
  return {
    provider: ai.name,
    model: ai.getCurrentModel?.() ?? null,
    usage: usage
      ? {
          promptTokens: usage.promptTokens ?? 0,
          completionTokens: usage.completionTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          costUsd: usage.costUsd ?? 0,
        }
      : null,
  };
}

export async function saveAIUsageLog(params: {
  userId: string;
  isGuest: boolean;
  endpoint: string;
  metadata: AIResponseMetadata | null;
}) {
  const { userId, isGuest, endpoint, metadata } = params;
  if (!metadata?.provider) return;

  try {
    await connectDB();
    await AIUsageLog.create({
      userId,
      isGuest,
      provider: metadata.provider,
      modelId: metadata.model || "unknown",
      endpoint,
      promptTokens: metadata.usage?.promptTokens ?? 0,
      completionTokens: metadata.usage?.completionTokens ?? 0,
      totalTokens: metadata.usage?.totalTokens ?? 0,
      costUsd: metadata.usage?.costUsd ?? 0,
    });
  } catch (error) {
    console.warn("[AIUsageLog] Failed to persist usage:", error);
  }
}
