import { NextResponse } from "next/server";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
}

/** Shape of a model entry as returned by the OpenRouter API (all fields untrusted). */
interface RawOpenRouterModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: Record<string, unknown>;
}

const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function isFreePricing(value: unknown): boolean {
  return typeof value === "string" && Number(value) === 0;
}

export async function GET() {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let preferredOpenRouterModel = DEFAULT_OPENROUTER_MODEL;
    if (!actor.isGuest) {
      await connectDB();
      const user = await User.findById(actor.id).lean();
      preferredOpenRouterModel =
        (user as unknown as { preferredOpenRouterModel?: string })?.preferredOpenRouterModel ||
        DEFAULT_OPENROUTER_MODEL;
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/models?output_modalities=text",
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `OpenRouter models API returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const models: OpenRouterModel[] = (data?.data ?? [])
      .filter((m: RawOpenRouterModel) => {
        const id = typeof m?.id === "string" ? m.id : "";
        const pricing = m?.pricing ?? {};
        const freeBySuffix = id.includes(":free");
        const freeByPricing =
          isFreePricing(pricing.prompt) &&
          isFreePricing(pricing.completion) &&
          isFreePricing(pricing.request ?? "0");

        return freeBySuffix || freeByPricing;
      })
      .map((m: RawOpenRouterModel) => ({
        id: m.id ?? "",
        name: m.name || m.id || "",
        description: m.description,
        contextLength: m.context_length,
      }))
      .sort((a: OpenRouterModel, b: OpenRouterModel) => a.name.localeCompare(b.name));

    const selectedMissing =
      preferredOpenRouterModel && !models.some((model) => model.id === preferredOpenRouterModel);

    if (selectedMissing) {
      models.unshift({
        id: preferredOpenRouterModel,
        name: `${preferredOpenRouterModel} (saved)`,
      });
    }

    return NextResponse.json({
      models,
      preferredOpenRouterModel,
      defaultModel: DEFAULT_OPENROUTER_MODEL,
    });
  } catch (error) {
    console.error("[Settings/OpenRouterModels] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
