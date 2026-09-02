import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Feed mode: the path that runs with no mission, no goal and no cycle.
 *
 * The thing worth pinning down here is that a feed tick never touches the
 * planning stack — the whole reason the mode exists is that goal decomposition
 * and weekly cycles were overhead the user did not want — and that the queue it
 * builds respects both the comment/like split and the day's budget.
 */

const m = vi.hoisted(() => ({
  configFindOne: vi.fn(),
  goalFindOne: vi.fn(),
  goalCreate: vi.fn(),
  cycleFindOne: vi.fn(),
  cycleCreate: vi.fn(),
  taskFind: vi.fn(),
  taskFindOne: vi.fn(),
  taskCreate: vi.fn(),
  taskCountDocuments: vi.fn(),
  taskFindOneAndUpdate: vi.fn(),
  targetAggregate: vi.fn(),
  journalExists: vi.fn(),
  sendToExtension: vi.fn(),
  journal: vi.fn(),
  check: vi.fn(),
  closeCycle: vi.fn(),
  getUserAIProvider: vi.fn(),
  usageFindOne: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sse", () => ({ pushSseEvent: vi.fn() }));
vi.mock("@/lib/websocket/server", () => ({
  sendToExtension: m.sendToExtension,
  isExtensionConnected: () => true,
}));
vi.mock("@/lib/autopilot/journal", () => ({
  journal: m.journal,
  journalDigest: vi.fn().mockResolvedValue("(digest)"),
}));
vi.mock("@/lib/autopilot/memory", () => ({ recallBlock: vi.fn().mockResolvedValue("(none)") }));
vi.mock("@/lib/autopilot/reviewer", () => ({ closeCycle: m.closeCycle }));
vi.mock("@/lib/ai/key-manager", () => ({ getUserAIProvider: m.getUserAIProvider }));

vi.mock("@/lib/autopilot/governor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/autopilot/governor")>(
    "@/lib/autopilot/governor"
  );
  return { ...actual, check: m.check };
});

vi.mock("@/lib/db/models/agent-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-config")>(
    "@/lib/db/models/agent-config"
  );
  return { ...actual, default: { findOne: m.configFindOne } };
});
vi.mock("@/lib/db/models/agent-goal", () => ({
  default: { findOne: m.goalFindOne, create: m.goalCreate },
}));
vi.mock("@/lib/db/models/agent-cycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-cycle")>(
    "@/lib/db/models/agent-cycle"
  );
  return { ...actual, default: { findOne: m.cycleFindOne, create: m.cycleCreate } };
});
vi.mock("@/lib/db/models/agent-task", () => ({
  default: {
    find: m.taskFind,
    findOne: m.taskFindOne,
    create: m.taskCreate,
    countDocuments: m.taskCountDocuments,
    findOneAndUpdate: m.taskFindOneAndUpdate,
  },
  ACTIVE_TASK_STATES: ["queued", "dispatched", "running"],
}));
vi.mock("@/lib/db/models/agent-journal", () => ({ default: { exists: m.journalExists } }));
// Feed budgets are counted in real LinkedIn actions, not in tasks: one sweep
// spends one action per post it engages, so DailyUsage — not the task
// collection — is what decides how much a top-up may queue.
vi.mock("@/lib/db/models/daily-usage", () => ({ default: { findOne: m.usageFindOne } }));
vi.mock("@/lib/db/models/agent-target", () => ({
  default: { findOne: vi.fn(), aggregate: m.targetAggregate },
  ACTIVE_STAGES: [],
}));
vi.mock("@/lib/db/models/career-profile", () => ({
  default: { findOne: () => ({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock("@/lib/db/models/profile-analysis", () => ({
  default: { findOne: () => ({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock("@/lib/db/models/user", () => ({
  default: { findById: () => ({ lean: vi.fn().mockResolvedValue(null) }) },
}));

import { tick, topUpFeedQueue } from "@/lib/autopilot/planner";

const USER = "507f1f77bcf86cd799439011";

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    enabled: true,
    mode: "feed",
    mission: "",
    feed: { commentRatio: 0.5, pitchOnJobPosts: true, postsPerSweep: 25, postsPerPass: 5 },
    workingHours: { start: 0, end: 24, timezone: "UTC", activeDays: [0, 1, 2, 3, 4, 5, 6] },
    weeklyBudgets: {
      connects: 75,
      comments: 100,
      dms: 60,
      posts: 3,
      likes: 150,
      profileViews: 300,
    },
    autonomy: new Map(),
    rampStartedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * countDocuments is asked three different questions in one top-up: how much is
 * queued overall, then per kind how much ran today and how much is in flight.
 * Answering by shape keeps the test honest about which is which.
 */
function countingBy({ queued = 0, doneToday = 0 } = {}) {
  return vi.fn(async (query: Record<string, unknown>) => {
    if (!query.kind) return queued;
    return query.state === "done" ? doneToday : 0;
  });
}

/** Today's DailyUsage row, as the governor reads it. */
function usedToday(actions: Record<string, number>) {
  return vi.fn(() => ({ lean: vi.fn().mockResolvedValue({ actions }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.configFindOne.mockResolvedValue(makeConfig());
  m.goalFindOne.mockResolvedValue(null);
  m.cycleFindOne.mockResolvedValue(null);
  m.taskFind.mockResolvedValue([]);
  m.taskCountDocuments.mockImplementation(countingBy({ queued: 0 }));
  m.taskCreate.mockImplementation(async (doc: Record<string, unknown>) => doc);
  m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  m.targetAggregate.mockResolvedValue([]);
  m.journalExists.mockResolvedValue(null);
  m.check.mockResolvedValue({ allowed: true });
  m.sendToExtension.mockReturnValue(true);
  m.getUserAIProvider.mockResolvedValue(null);
  m.usageFindOne.mockImplementation(usedToday({}));
});

describe("feed mode tick", () => {
  it("runs with no mission and never builds a goal or a cycle", async () => {
    await tick(USER);

    expect(m.goalCreate).not.toHaveBeenCalled();
    expect(m.cycleCreate).not.toHaveBeenCalled();
    expect(m.closeCycle).not.toHaveBeenCalled();
    // No AI call is needed to start working, which is the point of the mode.
    expect(m.getUserAIProvider).not.toHaveBeenCalled();
  });

  it("queues feed tasks rather than keyword tasks", async () => {
    await tick(USER);

    expect(m.taskCreate).toHaveBeenCalled();
    for (const [doc] of m.taskCreate.mock.calls) {
      expect(doc.payload.source).toBe("feed");
      expect(doc.payload.keyword).toBeUndefined();
      expect(["comment_on_feed", "like_post"]).toContain(doc.kind);
    }
  });

  it("still dispatches through the governor", async () => {
    const task = {
      _id: { toString: () => "task-1" },
      kind: "comment_on_feed",
      payload: { source: "feed" },
      state: "queued",
      rationale: "feed pass",
      save: vi.fn(),
    };
    m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(task) });
    m.taskFindOneAndUpdate.mockResolvedValue({ ...task, state: "dispatched" });

    const result = await tick(USER);

    expect(m.check).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, kind: "comment_on_feed" })
    );
    expect(result).toEqual({ ran: true, dispatched: "comment_on_feed" });
  });

  it("holds the queue when the governor blocks, exactly as strategist mode does", async () => {
    const task = {
      _id: { toString: () => "task-1" },
      kind: "like_post",
      payload: { source: "feed" },
      state: "queued",
      rationale: "feed pass",
      save: vi.fn(),
    };
    m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(task) });
    m.check.mockResolvedValue({
      allowed: false,
      gate: "budget",
      reason: "Daily likes budget spent",
      nextEligibleAt: new Date(Date.now() + 3600_000),
    });

    const result = await tick(USER);

    expect(result.blocked).toBe("budget");
    expect(m.sendToExtension).not.toHaveBeenCalled();
    expect(task.save).toHaveBeenCalled();
  });
});

describe("topUpFeedQueue", () => {
  it("splits the day's engagement by the configured comment ratio", async () => {
    // The ratio splits posts, not tasks: one sweep engages up to postsPerPass
    // of them, so what has to come out at 50/50 is the budget each kind of
    // sweep is handed, not how many sweeps there are.
    const created = await topUpFeedQueue(USER, makeConfig() as never);

    const docs = m.taskCreate.mock.calls.map(([doc]) => doc);
    expect(created).toBe(docs.length);

    const postsFor = (kind: string) =>
      docs
        .filter((d) => d.kind === kind)
        .reduce((sum, d) => sum + d.payload.maxEngagements, 0);

    // 150 likes / 7 active days ≈ 21 posts a day, half of them commented on.
    expect(postsFor("comment_on_feed")).toBe(11);
    expect(postsFor("like_post")).toBe(10);
  });

  it("never hands out more posts per pass than the setting allows", async () => {
    await topUpFeedQueue(USER, makeConfig() as never);

    for (const [doc] of m.taskCreate.mock.calls) {
      expect(doc.payload.maxEngagements).toBeGreaterThan(0);
      expect(doc.payload.maxEngagements).toBeLessThanOrEqual(5);
    }
  });

  it("keeps the queued sweeps inside the day's comment budget", async () => {
    // 100 comments / 7 active days ≈ 14, of which 10 are already spent.
    m.usageFindOne.mockImplementation(usedToday({ comments: 10, likes: 0 }));

    await topUpFeedQueue(USER, makeConfig() as never);

    const commentPosts = m.taskCreate.mock.calls
      .map(([doc]) => doc)
      .filter((d) => d.kind === "comment_on_feed")
      .reduce((sum, d) => sum + d.payload.maxEngagements, 0);

    expect(commentPosts).toBeLessThanOrEqual(4);
  });

  it("comments on everything at a ratio of 1", async () => {
    await topUpFeedQueue(
      USER,
      makeConfig({
        feed: { commentRatio: 1, pitchOnJobPosts: true, postsPerSweep: 25, postsPerPass: 5 },
      }) as never
    );

    const kinds = m.taskCreate.mock.calls.map(([doc]) => doc.kind);
    expect(kinds.every((k) => k === "comment_on_feed")).toBe(true);
  });

  it("marks comment tasks to like the post they comment on", async () => {
    await topUpFeedQueue(USER, makeConfig() as never);

    const comment = m.taskCreate.mock.calls
      .map(([doc]) => doc)
      .find((doc) => doc.kind === "comment_on_feed");
    const like = m.taskCreate.mock.calls
      .map(([doc]) => doc)
      .find((doc) => doc.kind === "like_post");

    expect(comment.payload.alsoLike).toBe(true);
    expect(like.payload.alsoLike).toBe(false);
  });

  it("carries the pitch setting onto the task so the extension can pass it back", async () => {
    await topUpFeedQueue(
      USER,
      makeConfig({
        feed: { commentRatio: 0.5, pitchOnJobPosts: false, postsPerSweep: 40, postsPerPass: 5 },
      }) as never
    );

    const [doc] = m.taskCreate.mock.calls[0];
    expect(doc.payload.pitchOnJobPosts).toBe(false);
    expect(doc.payload.postsPerSweep).toBe(40);
  });

  it("queues nothing once the day's comment and like budgets are spent", async () => {
    // Well past both daily ceilings (100 comments and 150 likes over 7 days).
    m.usageFindOne.mockImplementation(usedToday({ comments: 999, likes: 999 }));

    const created = await topUpFeedQueue(USER, makeConfig() as never);

    expect(created).toBe(0);
    expect(m.taskCreate).not.toHaveBeenCalled();
  });

  it("adds nothing when the queue is already deep enough", async () => {
    m.taskCountDocuments.mockImplementation(countingBy({ queued: 50 }));

    const created = await topUpFeedQueue(USER, makeConfig() as never);

    expect(created).toBe(0);
    expect(m.taskCreate).not.toHaveBeenCalled();
  });

  it("says why it is idle exactly once, not on every tick", async () => {
    m.usageFindOne.mockImplementation(usedToday({ comments: 999, likes: 999 }));

    await topUpFeedQueue(USER, makeConfig() as never);
    expect(m.journal).toHaveBeenCalledTimes(1);

    // Second tick: the same explanation is already in the journal.
    m.journal.mockClear();
    m.journalExists.mockResolvedValue({ _id: "already-said" });
    await topUpFeedQueue(USER, makeConfig() as never);

    expect(m.journal).not.toHaveBeenCalled();
  });
});

describe("budget spillover", () => {
  it("fills the queue with likes when the comment budget alone is spent", async () => {
    // 100 comments / 7 active days ≈ 14 a day, all of them already posted.
    m.usageFindOne.mockImplementation(usedToday({ comments: 999, likes: 0 }));

    const created = await topUpFeedQueue(USER, makeConfig() as never);

    const kinds = m.taskCreate.mock.calls.map(([doc]) => doc.kind);
    expect(created).toBeGreaterThan(0);
    expect(kinds.every((k) => k === "like_post")).toBe(true);
  });
});
