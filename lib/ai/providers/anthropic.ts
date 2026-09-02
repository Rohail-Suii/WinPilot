import type { AIProvider, AIMessage, AIGenerateOptions, AIUsageInfo } from "../provider";

/**
 * Per-million-token prices, input and output.
 *
 * Only used to report what a call cost so the daily allowance can be enforced
 * and shown. Prefixes are matched longest-first so a dated model id resolves.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-3-5-haiku": { in: 0.8, out: 4 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-opus-4": { in: 15, out: 75 },
};

function priceFor(model: string) {
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : { in: 3, out: 15 };
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";

  static readonly DEFAULT_MODEL = "claude-sonnet-4-20250514";

  private lastUsage: AIUsageInfo | null = null;
  private lastModel: string = AnthropicProvider.DEFAULT_MODEL;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  getCurrentModel(): string {
    return this.lastModel;
  }

  getLastUsage(): AIUsageInfo | null {
    return this.lastUsage;
  }

  /**
   * Record what the call actually cost.
   *
   * Cached input is billed at a tenth of the normal rate and cache writes at
   * 1.25x, and both arrive as separate counters — folding them in at their own
   * rates is the only way the reported figure matches the bill, and the only
   * way the saving from caching is visible rather than assumed.
   */
  private recordUsage(model: string, usage: Record<string, number> | undefined) {
    this.lastModel = model;
    if (!usage) {
      this.lastUsage = null;
      return;
    }

    const price = priceFor(model);
    const fresh = usage.input_tokens ?? 0;
    const cacheRead = usage.cache_read_input_tokens ?? 0;
    const cacheWrite = usage.cache_creation_input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;

    const costUsd =
      ((fresh + cacheWrite * 1.25 + cacheRead * 0.1) * price.in) / 1_000_000 +
      (output * price.out) / 1_000_000;

    this.lastUsage = {
      promptTokens: fresh + cacheRead + cacheWrite,
      completionTokens: output,
      totalTokens: fresh + cacheRead + cacheWrite + output,
      costUsd,
    };
  }

  /**
   * The system prompt, marked cacheable when it is long enough to be worth it.
   *
   * Autopilot sends the same system prompt — persona, memories, voice rules —
   * on every post it comments on, changing only the user message. Anthropic
   * charges 0.1x for a cache read, so marking it turns the dominant cost of a
   * feed pass into a rounding error. Below the 1024-token minimum the API
   * ignores the marker, so the guard just avoids paying the 1.25x write
   * premium on a prompt too small to be cached at all.
   */
  private systemBlock(content: string) {
    if (!content) return undefined;
    const roughTokens = content.length / 4;
    if (roughTokens < 1200) return content;
    return [
      {
        type: "text" as const,
        text: content,
        cache_control: { type: "ephemeral" as const },
      },
    ];
  }

  async generateText(messages: AIMessage[], options?: AIGenerateOptions): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");
    const model = options?.model?.trim() || AnthropicProvider.DEFAULT_MODEL;

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 2048,
        ...(systemMsg ? { system: this.systemBlock(systemMsg.content) } : {}),
        messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 0.95,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    this.recordUsage(data.model || model, data.usage);
    return data.content?.[0]?.text ?? "";
  }

  async generateJSON<T>(messages: AIMessage[], options?: AIGenerateOptions): Promise<T> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const systemPrompt = (systemMsg?.content ?? "") +
      "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no extra text.";
    const model = options?.model?.trim() || AnthropicProvider.DEFAULT_MODEL;

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: options?.maxTokens ?? 2048,
        system: this.systemBlock(systemPrompt),
        messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
    this.recordUsage(data.model || model, data.usage);
    const text = data.content?.[0]?.text ?? "{}";
    return JSON.parse(text) as T;
  }

  async validateKey(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
