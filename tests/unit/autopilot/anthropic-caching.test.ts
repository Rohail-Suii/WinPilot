/**
 * Prompt caching on the Anthropic provider.
 *
 * Autopilot sends the same system prompt — persona, memories, voice rules,
 * comment shapes — on every post it comments on, changing only the user
 * message. Anthropic bills a cache read at a tenth of the input rate, so
 * marking that block cacheable turns the dominant cost of a feed pass into a
 * rounding error. It is the single largest saving available and costs nothing
 * in quality.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";

function mockReply(usage: Record<string, number>, text = '{"comment":"x"}') {
  // Echo the model back the way the API does — pricing follows the model that
  // actually served the call, not the one that was asked for.
  global.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => ({
    ok: true,
    json: async () => ({
      model: JSON.parse(String(init.body)).model,
      content: [{ text }],
      usage,
    }),
  })) as unknown as typeof fetch;
}

function sentBody() {
  const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
    .mock.calls[0];
  return JSON.parse(String(init.body));
}

const LONG = "rule. ".repeat(1200);

beforeEach(() => {
  vi.clearAllMocks();
  mockReply({ input_tokens: 100, output_tokens: 50 });
});

describe("cache markers", () => {
  it("marks a long system prompt cacheable", async () => {
    const ai = new AnthropicProvider("k");
    await ai.generateJSON([
      { role: "system", content: LONG },
      { role: "user", content: "the post" },
    ]);

    expect(sentBody().system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("leaves a short system prompt as plain text", async () => {
    // Below Anthropic's minimum the marker does nothing but incur the 1.25x
    // write premium on a block that will never be read back.
    const ai = new AnthropicProvider("k");
    await ai.generateText([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);

    expect(sentBody().system).toBe("be brief");
  });

  it("caches on the plain-text path too", async () => {
    const ai = new AnthropicProvider("k");
    await ai.generateText([
      { role: "system", content: LONG },
      { role: "user", content: "the post" },
    ]);

    expect(sentBody().system[0].cache_control).toEqual({ type: "ephemeral" });
  });
});

describe("model selection", () => {
  it("uses the caller's model when one is given", async () => {
    const ai = new AnthropicProvider("k");
    await ai.generateJSON([{ role: "user", content: "hi" }], {
      model: "claude-haiku-4-5-20251001",
    });

    expect(sentBody().model).toBe("claude-haiku-4-5-20251001");
  });

  it("falls back to the default when none is given", async () => {
    const ai = new AnthropicProvider("k");
    await ai.generateJSON([{ role: "user", content: "hi" }]);

    expect(sentBody().model).toBe(AnthropicProvider.DEFAULT_MODEL);
  });
});

describe("what the call cost", () => {
  it("bills cached input at a tenth of the fresh rate", async () => {
    // 10k tokens through the cache against 10k fresh is the whole point of
    // the change, and the reported cost has to show it or the daily spend
    // limit is enforcing a number that is not the bill.
    const ai = new AnthropicProvider("k");

    mockReply({ input_tokens: 10_000, output_tokens: 0 });
    await ai.generateJSON([{ role: "user", content: "hi" }], { model: "claude-haiku-4-5" });
    const fresh = ai.getLastUsage()!.costUsd!;

    mockReply({ input_tokens: 0, cache_read_input_tokens: 10_000, output_tokens: 0 });
    await ai.generateJSON([{ role: "user", content: "hi" }], { model: "claude-haiku-4-5" });
    const cached = ai.getLastUsage()!.costUsd!;

    expect(cached).toBeCloseTo(fresh * 0.1, 6);
  });

  it("charges the write premium on the call that fills the cache", async () => {
    const ai = new AnthropicProvider("k");
    mockReply({ input_tokens: 0, cache_creation_input_tokens: 10_000, output_tokens: 0 });
    await ai.generateJSON([{ role: "user", content: "hi" }], { model: "claude-haiku-4-5" });

    // 10k tokens at $1/M, written at 1.25x.
    expect(ai.getLastUsage()!.costUsd).toBeCloseTo(0.0125, 6);
  });

  it("counts cached tokens as prompt tokens so usage is not understated", async () => {
    const ai = new AnthropicProvider("k");
    mockReply({ input_tokens: 200, cache_read_input_tokens: 2000, output_tokens: 100 });
    await ai.generateJSON([{ role: "user", content: "hi" }]);

    const usage = ai.getLastUsage()!;
    expect(usage.promptTokens).toBe(2200);
    expect(usage.completionTokens).toBe(100);
    expect(usage.totalTokens).toBe(2300);
  });

  it("prices haiku below sonnet", async () => {
    const ai = new AnthropicProvider("k");
    mockReply({ input_tokens: 10_000, output_tokens: 1000 });

    await ai.generateJSON([{ role: "user", content: "hi" }], { model: "claude-sonnet-4-20250514" });
    const sonnet = ai.getLastUsage()!.costUsd!;

    await ai.generateJSON([{ role: "user", content: "hi" }], { model: "claude-haiku-4-5-20251001" });
    const haiku = ai.getLastUsage()!.costUsd!;

    expect(haiku).toBeLessThan(sonnet);
  });
});
