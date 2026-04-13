import type { AIProvider, AIMessage, AIGenerateOptions } from "../provider";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(messages: AIMessage[], options?: AIGenerateOptions): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: options?.maxTokens ?? 2048,
        ...(systemMsg ? { system: systemMsg.content } : {}),
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
    return data.content?.[0]?.text ?? "";
  }

  async generateJSON<T>(messages: AIMessage[], options?: AIGenerateOptions): Promise<T> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const systemPrompt = (systemMsg?.content ?? "") +
      "\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no extra text.";

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: options?.maxTokens ?? 2048,
        system: systemPrompt,
        messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error: ${res.status} — ${err}`);
    }

    const data = await res.json();
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
