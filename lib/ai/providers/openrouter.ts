import type { AIProvider, AIMessage, AIGenerateOptions, AIUsageInfo } from "../provider";

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";
  private selectedModel: string;
  private lastUsage: AIUsageInfo | null = null;

  static readonly DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.selectedModel = model?.trim() || OpenRouterProvider.DEFAULT_MODEL;
  }

  getCurrentModel(): string {
    return this.selectedModel;
  }

  getLastUsage(): AIUsageInfo | null {
    return this.lastUsage;
  }

  private getDefaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (process.env.OPENROUTER_HTTP_REFERER) {
      headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
    }

    if (process.env.OPENROUTER_APP_TITLE) {
      headers["X-OpenRouter-Title"] = process.env.OPENROUTER_APP_TITLE;
    }

    return headers;
  }

  private captureUsageFromResponse(data: { usage?: Record<string, unknown> } | null | undefined) {
    const usage = data?.usage;
    const totalCost = Number(usage?.cost ?? 0);

    this.lastUsage = {
      promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : undefined,
      totalTokens: typeof usage?.total_tokens === "number" ? usage.total_tokens : undefined,
      costUsd: Number.isFinite(totalCost) ? totalCost : undefined,
    };
  }

  async generateText(messages: AIMessage[], options?: AIGenerateOptions): Promise<string> {
    const model = options?.model?.trim() || this.selectedModel;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2048,
        top_p: options?.topP ?? 0.95,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    this.captureUsageFromResponse(data);
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateJSON<T>(messages: AIMessage[], options?: AIGenerateOptions): Promise<T> {
    const model = options?.model?.trim() || this.selectedModel;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    this.captureUsageFromResponse(data);
    const text = data.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(text) as T;
  }

  async validateKey(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/key`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
