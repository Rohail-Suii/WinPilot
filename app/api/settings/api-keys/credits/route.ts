import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import { decrypt } from "@/lib/utils/encryption";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";

export interface ProviderCreditsResult {
  provider: string;
  type: "credits" | "rate-limit" | "free-tier" | "error";
  // credits (OpenAI)
  totalGranted?: number;
  totalUsed?: number;
  available?: number;
  // rate-limit (Groq)
  remainingRequests?: number | null;
  totalRequests?: number | null;
  remainingTokens?: number | null;
  totalTokens?: number | null;
  resetIn?: string | null;
  // free-tier (Gemini)
  note?: string;
  // error
  error?: string;
}

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    if (isGuest) {
      return NextResponse.json({ credits: [] });
    }

    await connectDB();
    const user = await User.findById(userId).lean();

    if (!user?.aiApiKeys?.length) {
      return NextResponse.json({ credits: [] });
    }

    const results = await Promise.all(
      user.aiApiKeys.map(async (keyEntry) => {
        const apiKey = decrypt(keyEntry.encryptedKey);
        return checkProviderCredits(keyEntry.provider, apiKey);
      })
    );

    return NextResponse.json({ credits: results });
  } catch (error) {
    console.error("[CreditsCheck]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function checkProviderCredits(
  provider: string,
  apiKey: string
): Promise<ProviderCreditsResult> {
  switch (provider) {
    case "groq":
      return checkGroqRateLimits(apiKey);
    case "openai":
      return checkOpenAICredits(apiKey);
    case "gemini":
      return checkGeminiInfo(apiKey);
    case "anthropic":
      return checkAnthropicInfo(apiKey);
    case "openrouter":
      return checkOpenRouterCredits(apiKey);
    default:
      return { provider, type: "error", error: "Provider not supported" };
  }
}

async function checkGroqRateLimits(apiKey: string): Promise<ProviderCreditsResult> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return { provider: "groq", type: "error", error: `API returned ${res.status}` };
    }

    const remainingRequests = res.headers.get("x-ratelimit-remaining-requests");
    const limitRequests = res.headers.get("x-ratelimit-limit-requests");
    const remainingTokens = res.headers.get("x-ratelimit-remaining-tokens");
    const limitTokens = res.headers.get("x-ratelimit-limit-tokens");
    const resetRequests = res.headers.get("x-ratelimit-reset-requests");

    return {
      provider: "groq",
      type: "rate-limit",
      remainingRequests: remainingRequests !== null ? parseInt(remainingRequests) : null,
      totalRequests: limitRequests !== null ? parseInt(limitRequests) : null,
      remainingTokens: remainingTokens !== null ? parseInt(remainingTokens) : null,
      totalTokens: limitTokens !== null ? parseInt(limitTokens) : null,
      resetIn: resetRequests,
    };
  } catch {
    return { provider: "groq", type: "error", error: "Failed to reach Groq API" };
  }
}

async function checkOpenAICredits(apiKey: string): Promise<ProviderCreditsResult> {
  try {
    // Use the models endpoint — the old billing endpoint is deprecated (403)
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return { provider: "openai", type: "error", error: `API key error (${res.status})` };
    }

    // Key is valid — OpenAI has no free credits API, direct user to dashboard
    return {
      provider: "openai",
      type: "free-tier",
      note: "Key valid · Check usage & billing at platform.openai.com/usage",
    };
  } catch {
    return { provider: "openai", type: "error", error: "Failed to reach OpenAI" };
  }
}

async function checkGeminiInfo(apiKey: string): Promise<ProviderCreditsResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`
    );

    if (!res.ok) {
      return { provider: "gemini", type: "error", error: "Key invalid or quota exceeded" };
    }

    return {
      provider: "gemini",
      type: "free-tier",
      note: "Free tier · 1M tokens/day · 15 RPM · ~200 resume tailors/day",
    };
  } catch {
    return { provider: "gemini", type: "error", error: "Failed to reach Gemini API" };
  }
}

async function checkAnthropicInfo(apiKey: string): Promise<ProviderCreditsResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    if (!res.ok) {
      await res.text();
      if (res.status === 401) {
        return { provider: "anthropic", type: "error", error: "Invalid API key" };
      }
      if (res.status === 429) {
        return { provider: "anthropic", type: "free-tier", note: "Key valid · Rate limited — try again shortly" };
      }
      return { provider: "anthropic", type: "error", error: `API returned ${res.status}` };
    }

    const rlRemaining = res.headers.get("x-ratelimit-remaining-requests");
    const rlLimit = res.headers.get("x-ratelimit-limit-requests");
    const tokRemaining = res.headers.get("x-ratelimit-remaining-tokens");
    const tokLimit = res.headers.get("x-ratelimit-limit-tokens");
    const resetAt = res.headers.get("x-ratelimit-reset-requests");

    if (rlRemaining !== null || tokRemaining !== null) {
      return {
        provider: "anthropic",
        type: "rate-limit",
        remainingRequests: rlRemaining !== null ? parseInt(rlRemaining) : null,
        totalRequests: rlLimit !== null ? parseInt(rlLimit) : null,
        remainingTokens: tokRemaining !== null ? parseInt(tokRemaining) : null,
        totalTokens: tokLimit !== null ? parseInt(tokLimit) : null,
        resetIn: resetAt,
      };
    }

    return {
      provider: "anthropic",
      type: "free-tier",
      note: "Key valid · Check usage at console.anthropic.com",
    };
  } catch {
    return { provider: "anthropic", type: "error", error: "Failed to reach Anthropic API" };
  }
}

async function checkOpenRouterCredits(apiKey: string): Promise<ProviderCreditsResult> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return { provider: "openrouter", type: "error", error: `API returned ${res.status}` };
    }

    const data = await res.json();
    const info = data?.data;

    if (info?.limit != null) {
      const limit = info.limit; // in USD
      const used = info.usage ?? 0;
      const available = Math.max(0, limit - used);
      return {
        provider: "openrouter",
        type: "credits",
        totalGranted: limit,
        totalUsed: used,
        available,
      };
    }

    // Free tier or unlimited
    if (info?.usage != null) {
      return {
        provider: "openrouter",
        type: "credits",
        totalGranted: 0,
        totalUsed: info.usage,
        available: 0,
        note: "Pay-as-you-go · Free models available",
      };
    }

    return {
      provider: "openrouter",
      type: "free-tier",
      note: "Key valid · Free models available · Check credits at openrouter.ai",
    };
  } catch {
    return { provider: "openrouter", type: "error", error: "Failed to reach OpenRouter" };
  }
}
