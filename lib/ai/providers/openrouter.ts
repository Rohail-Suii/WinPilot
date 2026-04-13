import type { AIProvider, AIMessage, AIGenerateOptions } from "../provider";

export class OpenRouterProvider implements AIProvider {
  name = "openrouter";
  private apiKey: string;
  private baseUrl = "https://openrouter.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateText(messages: AIMessage[], options?: AIGenerateOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
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
    return data.choices?.[0]?.message?.content ?? "";
  }

  async generateJSON<T>(messages: AIMessage[], options?: AIGenerateOptions): Promise<T> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
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
