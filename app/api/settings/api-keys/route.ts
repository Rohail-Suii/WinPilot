import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { aiApiKeySchema } from "@/lib/validators";
import { saveApiKey, removeApiKey, getUserApiKeys, revalidateApiKey } from "@/lib/ai/key-manager";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import type { AIProviderName } from "@/lib/ai/provider";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await getUserApiKeys(session.user.id);
    await connectDB();
    const user = await User.findById(session.user.id).lean();
    const preferredProvider = (user as unknown as { preferredAIProvider?: string })?.preferredAIProvider || "";
    return NextResponse.json({ keys, preferredProvider });
  } catch (error) {
    console.error("[Settings/ApiKeys] Error:", error);
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
    const parsed = aiApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { provider, apiKey } = parsed.data;
    const result = await saveApiKey(session.user.id, provider as AIProviderName, apiKey);

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    if (!provider || !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    await removeApiKey(session.user.id, provider as AIProviderName);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/ApiKeys] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    if (!provider || !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    const result = await revalidateApiKey(session.user.id, provider as AIProviderName);
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const { preferredProvider } = body;
    if (preferredProvider !== "" && !["gemini", "openai", "anthropic", "groq", "openrouter"].includes(preferredProvider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    await connectDB();
    await User.updateOne(
      { _id: session.user.id },
      { $set: { preferredAIProvider: preferredProvider } }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Settings/ApiKeys] Set preferred error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
