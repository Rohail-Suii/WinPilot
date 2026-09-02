/**
 * The AI allowance.
 *
 * Feed mode makes a model call per post it comments on, all day, with no
 * ceiling of its own — the LinkedIn budgets govern actions, not tokens. On a
 * metered key with no credit behind it, that is the difference between a
 * working agent and an exhausted balance by lunchtime.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ aggregate: vi.fn() }));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/models/ai-usage-log", () => ({ default: { aggregate: m.aggregate } }));

import { checkBudget, economyModel, usageToday } from "@/lib/autopilot/ai-budget";

const USER = "507f1f77bcf86cd799439011";

function used({ calls = 0, costUsd = 0 } = {}) {
  m.aggregate.mockResolvedValue([{ calls, costUsd }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  used();
});

describe("the call limit", () => {
  it("allows a call while there is allowance left", async () => {
    used({ calls: 149 });
    expect((await checkBudget(USER, { maxCalls: 150 })).allowed).toBe(true);
  });

  it("refuses once the allowance is spent", async () => {
    used({ calls: 150 });
    const verdict = await checkBudget(USER, { maxCalls: 150 });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/keep liking posts/);
  });

  it("treats 0 as uncapped, and does not even query", async () => {
    expect((await checkBudget(USER, { maxCalls: 0 })).allowed).toBe(true);
    expect(m.aggregate).not.toHaveBeenCalled();
  });
});

describe("the spend limit", () => {
  it("refuses once the day's dollars are gone", async () => {
    used({ calls: 10, costUsd: 2.5 });
    const verdict = await checkBudget(USER, { maxCalls: 0, maxCostUsd: 2 });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/\$2\.50 of \$2\.00/);
  });

  it("does not stop a run that is under both ceilings", async () => {
    used({ calls: 10, costUsd: 0.4 });
    expect((await checkBudget(USER, { maxCalls: 150, maxCostUsd: 2 })).allowed).toBe(true);
  });

  it("still stops on calls when the provider reports no cost at all", async () => {
    // Most providers report nothing, so a dollar-only cap would never fire.
    // This is why the call limit is the one that always holds.
    used({ calls: 150, costUsd: 0 });
    const verdict = await checkBudget(USER, { maxCalls: 150, maxCostUsd: 50 });

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/150 of 150 calls/);
  });
});

describe("what counts against the allowance", () => {
  it("counts only autopilot's own calls", async () => {
    await usageToday(USER);

    const [[pipeline]] = m.aggregate.mock.calls;
    expect(pipeline[0].$match.endpoint).toEqual({ $regex: "^/api/autopilot" });
  });

  it("counts only today", async () => {
    await usageToday(USER, "Asia/Karachi");

    const [[pipeline]] = m.aggregate.mock.calls;
    expect(pipeline[0].$match.createdAt.$gte).toBeInstanceOf(Date);
  });

  it("reads zero from an empty day rather than throwing", async () => {
    m.aggregate.mockResolvedValue([]);
    expect(await usageToday(USER)).toEqual({ calls: 0, costUsd: 0 });
  });
});

describe("economy models", () => {
  it("picks the cheap model on the metered providers", () => {
    expect(economyModel("anthropic")).toBe("claude-haiku-4-5-20251001");
    expect(economyModel("openai")).toBe("gpt-4o-mini");
    expect(economyModel("groq")).toBe("llama-3.1-8b-instant");
  });

  it("leaves alone the providers where overriding would cost more", () => {
    // OpenRouter's default is already a free model, and Gemini runs one model.
    expect(economyModel("openrouter")).toBeUndefined();
    expect(economyModel("gemini")).toBeUndefined();
    expect(economyModel(undefined)).toBeUndefined();
  });
});
