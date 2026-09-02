import { describe, it, expect, vi, beforeEach } from "vitest";

const { findOne, taskFindOne, usageFindOne, isExtensionConnected, updateOne } = vi.hoisted(
  () => ({
    findOne: vi.fn(),
    taskFindOne: vi.fn(),
    usageFindOne: vi.fn(),
    isExtensionConnected: vi.fn(),
    updateOne: vi.fn(),
  })
);

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/websocket/server", () => ({ isExtensionConnected }));
vi.mock("@/lib/db/models/agent-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-config")>(
    "@/lib/db/models/agent-config"
  );
  return { ...actual, default: { findOne, updateOne } };
});
vi.mock("@/lib/db/models/agent-task", () => ({ default: { findOne: taskFindOne } }));
vi.mock("@/lib/db/models/daily-usage", () => ({ default: { findOne: usageFindOne } }));

import * as governor from "@/lib/autopilot/governor";
import type { IAgentConfig } from "@/lib/db/models/agent-config";

/** A config that passes every gate, so each test can break exactly one thing. */
function makeConfig(overrides: Partial<IAgentConfig> = {}): IAgentConfig {
  return {
    userId: "u1",
    enabled: true,
    mission: "land an international React contract",
    workingHours: {
      start: 0,
      end: 24,
      timezone: "UTC",
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    },
    weeklyBudgets: {
      connects: 75,
      comments: 100,
      dms: 60,
      posts: 3,
      likes: 150,
      profileViews: 300,
    },
    autonomy: new Map(),
    rampStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // fully ramped
    ...overrides,
  } as unknown as IAgentConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  isExtensionConnected.mockReturnValue(true);
  usageFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  taskFindOne.mockReturnValue({
    sort: () => ({ select: () => ({ lean: vi.fn().mockResolvedValue(null) }) }),
  });
});

// ── Timezone handling ───────────────────────────────────────────────────────

describe("localTimeIn", () => {
  it("reads the hour in the target timezone, not the server's", () => {
    // 2026-08-23T06:00:00Z is 11:00 in Karachi (UTC+5)
    const at = new Date("2026-08-23T06:00:00Z");
    expect(governor.localTimeIn("UTC", at).hour).toBe(6);
    expect(governor.localTimeIn("Asia/Karachi", at).hour).toBe(11);
  });

  it("falls back to server time for an unknown timezone rather than blocking forever", () => {
    const at = new Date("2026-08-23T06:00:00Z");
    const result = governor.localTimeIn("Not/AZone", at);
    expect(result.hour).toBe(at.getHours());
  });
});

describe("isWithinUserHours", () => {
  it("blocks outside the configured window", () => {
    const config = makeConfig({
      workingHours: { start: 9, end: 17, timezone: "UTC", activeDays: [0, 1, 2, 3, 4, 5, 6] },
    } as Partial<IAgentConfig>);
    expect(governor.isWithinUserHours(config, new Date("2026-08-24T03:00:00Z"))).toBe(false);
    expect(governor.isWithinUserHours(config, new Date("2026-08-24T12:00:00Z"))).toBe(true);
  });

  it("blocks on inactive days even inside the hour window", () => {
    // 2026-08-23 is a Sunday
    const config = makeConfig({
      workingHours: { start: 9, end: 17, timezone: "UTC", activeDays: [1, 2, 3, 4, 5] },
    } as Partial<IAgentConfig>);
    expect(governor.isWithinUserHours(config, new Date("2026-08-23T12:00:00Z"))).toBe(false);
  });
});

describe("nextWindowStart", () => {
  it("returns a time that is actually inside the working window", () => {
    const config = makeConfig({
      workingHours: { start: 9, end: 17, timezone: "UTC", activeDays: [1, 2, 3, 4, 5] },
    } as Partial<IAgentConfig>);
    const from = new Date("2026-08-23T12:00:00Z"); // Sunday
    const next = governor.nextWindowStart(config, from);

    expect(next.getTime()).toBeGreaterThan(from.getTime());
    expect(governor.isWithinUserHours(config, next)).toBe(true);
  });
});

// ── Ramp-up ─────────────────────────────────────────────────────────────────

describe("rampFactor", () => {
  it("eases in over three weeks rather than starting at full budget", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    const weeksAgo = (n: number) =>
      makeConfig({ rampStartedAt: new Date(now.getTime() - n * 7 * 24 * 3600 * 1000) });

    expect(governor.rampFactor(weeksAgo(0), now)).toBe(0.4);
    expect(governor.rampFactor(weeksAgo(1), now)).toBe(0.7);
    expect(governor.rampFactor(weeksAgo(3), now)).toBe(1);
  });

  it("treats a never-started ramp as week one", () => {
    expect(governor.rampFactor(makeConfig({ rampStartedAt: undefined }))).toBe(0.4);
  });
});

describe("dailyCeiling", () => {
  it("spreads the weekly budget across active days and applies the ramp", () => {
    const now = new Date("2026-08-23T12:00:00Z");
    const config = makeConfig({
      workingHours: { start: 9, end: 17, timezone: "UTC", activeDays: [1, 2, 3, 4, 5] },
      rampStartedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
    } as Partial<IAgentConfig>);

    // 100 comments/week over 5 active days at full ramp
    expect(governor.dailyCeiling(config, "comments", now)).toBe(20);
  });
});

// ── The gate ────────────────────────────────────────────────────────────────

describe("check", () => {
  it("blocks while paused, and reports when it resumes", async () => {
    const until = new Date(Date.now() + 60 * 60 * 1000);
    findOne.mockResolvedValue(makeConfig({ pausedUntil: until, pauseReason: "checkpoint" }));

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("paused");
    expect(verdict.nextEligibleAt).toEqual(until);
  });

  it("blocks outside working hours", async () => {
    findOne.mockResolvedValue(
      makeConfig({
        workingHours: { start: 9, end: 17, timezone: "UTC", activeDays: [1, 2, 3, 4, 5] },
      } as Partial<IAgentConfig>)
    );

    const verdict = await governor.check({
      userId: "u1",
      kind: "comment_on_feed",
      now: new Date("2026-08-24T03:00:00Z"),
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("working_hours");
  });

  it("blocks a kind the user set to manual review", async () => {
    findOne.mockResolvedValue(
      makeConfig({ autonomy: new Map([["comment_on_feed", "review"]]) } as Partial<IAgentConfig>)
    );

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("autonomy");
  });

  it("blocks when the day's budget for that action is spent", async () => {
    findOne.mockResolvedValue(makeConfig());
    // 100 comments/week over 7 active days at full ramp = 14/day
    usageFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ actions: { comments: 14 } }),
    });

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("budget");
  });

  it("blocks during the cooldown after the last action of the same category", async () => {
    findOne.mockResolvedValue(makeConfig());
    taskFindOne.mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: vi.fn().mockResolvedValue({ completedAt: new Date(Date.now() - 10_000) }),
        }),
      }),
    });

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("cooldown");
    expect(verdict.nextEligibleAt).toBeInstanceOf(Date);
  });

  it("blocks when the extension is offline", async () => {
    findOne.mockResolvedValue(makeConfig());
    isExtensionConnected.mockReturnValue(false);

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("extension_offline");
  });

  it("allows an action that clears every gate", async () => {
    findOne.mockResolvedValue(makeConfig());

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(true);
  });

  it("skips budget and cooldown for bookkeeping kinds that cost no LinkedIn action", async () => {
    findOne.mockResolvedValue(makeConfig());
    usageFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ actions: { comments: 9999 } }),
    });

    const verdict = await governor.check({ userId: "u1", kind: "plan_cycle" });

    expect(verdict.allowed).toBe(true);
  });

  it("refuses to run without a config at all", async () => {
    findOne.mockResolvedValue(null);

    const verdict = await governor.check({ userId: "u1", kind: "comment_on_feed" });

    expect(verdict.allowed).toBe(false);
  });
});

// ── Circuit breaker ─────────────────────────────────────────────────────────

describe("isTripSignal", () => {
  it("recognises LinkedIn pushback in whatever wording arrives", () => {
    for (const text of [
      "Security checkpoint detected",
      "Please complete the CAPTCHA",
      "We noticed some unusual activity",
      "Your account has been restricted",
      "session lost",
      "HTTP 429 Too Many Requests",
    ]) {
      expect(governor.isTripSignal(text)).toBe(true);
    }
  });

  it("does not trip on ordinary failures", () => {
    expect(governor.isTripSignal("Comment button not found")).toBe(false);
    expect(governor.isTripSignal("")).toBe(false);
    expect(governor.isTripSignal(undefined)).toBe(false);
  });
});

describe("trip", () => {
  it("pauses the agent for six hours", async () => {
    findOne.mockResolvedValue(makeConfig());
    updateOne.mockResolvedValue({});

    const before = Date.now();
    const until = await governor.trip("u1", "checkpoint hit");

    expect(until.getTime()).toBeGreaterThan(before + 5 * 60 * 60 * 1000);
    expect(updateOne).toHaveBeenCalledOnce();
  });

  it("never shortens a longer pause already in place", async () => {
    const longer = new Date(Date.now() + 48 * 60 * 60 * 1000);
    findOne.mockResolvedValue(makeConfig({ pausedUntil: longer }));

    const until = await governor.trip("u1", "another checkpoint");

    expect(until).toEqual(longer);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("feed mode with no limits", () => {
  const unlimitedConfig = (over: Record<string, unknown> = {}) =>
    makeConfig({
      mode: "feed",
      feed: { commentRatio: 0.7, pitchOnJobPosts: true, postsPerSweep: 25, postsPerPass: 5, unlimited: true, economyMode: true, dailyAiCalls: 150, dailyAiSpendUsd: 0 },
      ...over,
    });

  it("lets a feed comment through with the day's comment budget spent", async () => {
    usageFindOne.mockReturnValue({ lean: async () => ({ actions: { comments: 9999 } }) });

    const verdict = await governor.check({
      userId: "u1",
      kind: "comment_on_feed",
      config: unlimitedConfig() as never,
    });

    expect(verdict.allowed).toBe(true);
  });

  it("lets a feed like through with the like budget spent", async () => {
    usageFindOne.mockReturnValue({ lean: async () => ({ actions: { likes: 9999 } }) });

    const verdict = await governor.check({
      userId: "u1",
      kind: "like_post",
      config: unlimitedConfig() as never,
    });

    expect(verdict.allowed).toBe(true);
  });

  it("still holds every other kind to its budget", async () => {
    usageFindOne.mockReturnValue({ lean: async () => ({ actions: { profileViews: 9999 } }) });

    const verdict = await governor.check({
      userId: "u1",
      kind: "view_target_profile",
      config: unlimitedConfig() as never,
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("budget");
  });

  it("still stops for a tripped circuit breaker", async () => {
    usageFindOne.mockReturnValue({ lean: async () => ({ actions: {} }) });

    const verdict = await governor.check({
      userId: "u1",
      kind: "comment_on_feed",
      config: unlimitedConfig({
        pausedUntil: new Date(Date.now() + 3600_000),
        pauseReason: "LinkedIn pushed back",
      }) as never,
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("paused");
  });

  it("holds the budget line when the switch is off", async () => {
    usageFindOne.mockReturnValue({ lean: async () => ({ actions: { comments: 9999 } }) });

    const verdict = await governor.check({
      userId: "u1",
      kind: "comment_on_feed",
      config: makeConfig({
        mode: "feed",
        feed: { commentRatio: 0.7, pitchOnJobPosts: true, postsPerSweep: 25, postsPerPass: 5, unlimited: false, economyMode: true, dailyAiCalls: 150, dailyAiSpendUsd: 0 },
      }) as never,
    });

    expect(verdict.allowed).toBe(false);
    expect(verdict.gate).toBe("budget");
  });
});
