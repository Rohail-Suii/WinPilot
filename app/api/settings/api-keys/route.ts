import { NextResponse } from "next/server";
import { aiApiKeySchema } from "@/lib/validators";
import { saveApiKey, removeApiKey, getUserApiKeys, revalidateApiKey } from "@/lib/ai/key-manager";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import type { AIProviderName } from "@/lib/ai/provider";
import { getActorId } from "@/lib/utils/get-actor-id";

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    // Guests have no User document — return empty state
    if (isGuest) {
      return NextResponse.json({
        keys: [],
        preferredProvider: "",
        preferredOpenRouterModel: "meta-llama/llama-3.3-70b-instruct:free",
      });
    }

    const keys = await getUserApiKeys(userId);
    await connectDB();
    const user = await User.findById(userId).lean();
    const preferredProvider = (user as unknown as { preferredAIProvider?: string })?.preferredAIProvider || "";
    const preferredOpenRouterModel =
      (user as unknown as { preferredOpenRouterModel?: string })?.preferredOpenRouterModel ||
      "meta-llama/llama-3.3-70b-instruct:free";

    return NextResponse.json({ keys, preferredProvider, preferredOpenRouterModel });
  } catch (error) {
    console.error("[Settings/ApiKeys] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    // Guests cannot save API keys — they require a User account
    if (isGuest) {
      return NextResponse.json(
        { error: "Create a free account to save API keys", requiresAuth: true },
        { status: 403 }
      );
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = aiApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { provider, apiKey } = parsed.data;
    const result = await saveApiKey(userId, provider as AIProviderName, apiKey);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      isValid: result.isValid,
      message: result.isValid ? "API key saved and validated" : "API key saved but validation failed",
    });
  } catch (error) {
    console.error("[Settings/ApiKeys] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    if (isGuest) {
      return NextResponse.json(
        { error: "Create a free account to manage API keys", requiresAuth: true },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    if (!provider || !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    await removeApiKey(userId, provider as AIProviderName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/ApiKeys] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;
    if (isGuest) {
      return NextResponse.json({ error: "Create a free account to manage API keys", requiresAuth: true }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    if (!provider || !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    const result = await revalidateApiKey(userId, provider as AIProviderName);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ isValid: result.isValid });
  } catch (error) {
    console.error("[Settings/ApiKeys] Revalidate error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;
    if (isGuest) {
      return NextResponse.json({ error: "Create a free account to set preferences", requiresAuth: true }, { status: 403 });
    }
    const body = await req.json();
    const { preferredProvider, preferredOpenRouterModel } = body as {
      preferredProvider?: string;
      preferredOpenRouterModel?: string;
    };

    if (
      preferredProvider !== undefined &&
      preferredProvider !== "" &&
      !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(preferredProvider)
    ) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    if (
      preferredOpenRouterModel !== undefined &&
      (typeof preferredOpenRouterModel !== "string" || preferredOpenRouterModel.trim().length === 0)
    ) {
      return NextResponse.json({ error: "Invalid OpenRouter model" }, { status: 400 });
    }

    const setPayload: Record<string, string> = {};
    if (preferredProvider !== undefined) {
      setPayload.preferredAIProvider = preferredProvider;
    }
    if (preferredOpenRouterModel !== undefined) {
      setPayload.preferredOpenRouterModel = preferredOpenRouterModel.trim();
    }

    if (Object.keys(setPayload).length === 0) {
      return NextResponse.json({ error: "No preference fields provided" }, { status: 400 });
    }

    await connectDB();
    await User.updateOne(
      { _id: userId },
      { $set: setPayload }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/ApiKeys] Set preferred error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
