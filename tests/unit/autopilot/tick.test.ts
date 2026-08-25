import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end exercise of one planner tick with every model mocked.
 *
 * This is the closest thing to the live smoke test that can run without a
 * database and a logged-in browser: it asserts the chain the agent depends on —
 * config → goal → cycle → queue top-up → governor → dispatch — and that a
 * server restart mid-cycle resumes rather than re-planning.
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
  targetFindOne: vi.fn(),
  targetAggregate: vi.fn(),
  journalExists: vi.fn(),
  sendToExtension: vi.fn(),
  journal: vi.fn(),
  check: vi.fn(),
  closeCycle: vi.fn(),
  getUserAIProvider: vi.fn(),
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
vi.mock("@/lib/db/models/agent-journal", () => ({
  default: { exists: m.journalExists },
}));
vi.mock("@/lib/db/models/agent-target", () => ({
  default: { findOne: m.targetFindOne, aggregate: m.targetAggregate },
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

import { tick } from "@/lib/autopilot/planner";

const USER = "507f1f77bcf86cd799439011";

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER,
    enabled: true,
    mission: "land an international React contract",
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

function makeGoal() {
  return {
    _id: "goal-1",
    northStar: "Start 10 DM conversations with founders at 5-100 person startups.",
    successMetric: { kind: "dm_conversations_started", target: 10, by: new Date() },
    constraints: {
      niche: ["nextjs", "react"],
      targetRoles: ["Founder", "CTO"],
      targetCompanySizeMin: 5,
      targetCompanySizeMax: 100,
      geographies: ["United States"],
      excludes: [],
    },
    personaSnapshot: { headline: "Full-stack developer", topSkills: ["React"], voiceNotes: "" },
  };
}

function makeCycle(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => "cycle-1" },
    weekNumber: 1,
    startsAt: new Date(Date.now() - 24 * 3600 * 1000),
    endsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000),
    strategy: "Build early visibility through niche commenting.",
    channelMix: { prospecting: 40, content: 20, engagement: 30, inbox: 10 },
    targets: [],
    status: "running",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.configFindOne.mockResolvedValue(makeConfig());
  m.goalFindOne.mockResolvedValue(makeGoal());
  m.cycleFindOne.mockResolvedValue(makeCycle());
  m.taskFind.mockResolvedValue([]); // no stuck tasks to reclaim
  m.taskCountDocuments.mockResolvedValue(50); // queue already full — skip top-up
  m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
  m.targetAggregate.mockResolvedValue([]);
  m.journalExists.mockResolvedValue(null);
  m.check.mockResolvedValue({ allowed: true });
  m.sendToExtension.mockReturnValue(true);
});

describe("tick", () => {
  it("does nothing when autopilot is disabled", async () => {
    m.configFindOne.mockResolvedValue(makeConfig({ enabled: false }));

    const result = await tick(USER);

    expect(result).toEqual({ ran: false, reason: "disabled" });
    expect(m.sendToExtension).not.toHaveBeenCalled();
  });

  it("does nothing while the safety pause is active", async () => {
    m.configFindOne.mockResolvedValue(
      makeConfig({
        pausedUntil: new Date(Date.now() + 3600_000),
        pauseReason: "checkpoint",
      })
    );

    const result = await tick(USER);

    expect(result.blocked).toBe("paused");
    expect(m.sendToExtension).not.toHaveBeenCalled();
  });

  it("resumes an open cycle rather than re-planning after a restart", async () => {
    await tick(USER);

    expect(m.closeCycle).not.toHaveBeenCalled();
    expect(m.cycleCreate).not.toHaveBeenCalled();
  });

  it("reviews the finished cycle and plans a new one when the week is up", async () => {
    const expired = makeCycle({ endsAt: new Date(Date.now() - 3600_000) });
    m.cycleFindOne.mockResolvedValue(expired);
    m.getUserAIProvider.mockResolvedValue(null); // falls back to the default plan
    m.cycleCreate.mockResolvedValue(makeCycle({ weekNumber: 2 }));

    await tick(USER);

    expect(m.closeCycle).toHaveBeenCalledWith(USER, expired);
    expect(m.cycleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ weekNumber: 2, status: "running" })
    );
  });

  it("dispatches the selected task once the governor clears it", async () => {
    const task = {
      _id: { toString: () => "task-1" },
      kind: "comment_on_feed",
      payload: { keyword: "nextjs" },
      state: "queued",
      rationale: "engagement share",
      save: vi.fn(),
    };
    m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(task) });
    m.taskFindOneAndUpdate.mockResolvedValue({ ...task, state: "dispatched" });

    const result = await tick(USER);

    expect(result).toEqual({ ran: true, dispatched: "comment_on_feed" });
    expect(m.sendToExtension).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ command: "RUN_TASK", kind: "comment_on_feed" })
    );
  });

  it("reschedules a blocked task to when it could actually run, instead of spinning on it", async () => {
    const eligibleAt = new Date(Date.now() + 30 * 60 * 1000);
    const task = {
      _id: { toString: () => "task-1" },
      kind: "comment_on_feed",
      payload: {},
      state: "queued",
      scheduledFor: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    m.taskFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(task) });
    m.check.mockResolvedValue({
      allowed: false,
      gate: "cooldown",
      reason: "cooling down",
      nextEligibleAt: eligibleAt,
    });

    const result = await tick(USER);

    expect(result.blocked).toBe("cooldown");
    expect(task.scheduledFor).toEqual(eligibleAt);
    expect(task.save).toHaveBeenCalled();
    expect(m.sendToExtension).not.toHaveBeenCalled();
  });

  it("stops cleanly, and says why, when there is no mission to work towards", async () => {
    m.configFindOne.mockResolvedValue(makeConfig({ mission: "" }));
    m.goalFindOne.mockResolvedValue(null);

    const result = await tick(USER);

    expect(result).toEqual({ ran: false, reason: "no goal" });
    expect(m.journal).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("no mission") })
    );
  });

  it("tops the queue up with engagement work when it runs thin", async () => {
    m.taskCountDocuments.mockResolvedValue(0);
    m.taskCreate.mockImplementation((doc) => Promise.resolve({ ...doc, _id: "t" }));
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

    await tick(USER);

    expect(m.taskCreate).toHaveBeenCalled();
    const kinds = m.taskCreate.mock.calls.map((c) => c[0].kind);
    expect(kinds).toContain("comment_on_feed");
    // Keywords come from the goal's niche, not from anything hard-coded
    const payloads = m.taskCreate.mock.calls.map((c) => c[0].payload.keyword);
    expect(payloads.every((k: string) => ["nextjs", "react"].includes(k))).toBe(true);
  });

  it("fills the whole queue when the plan allocates effort to unbuilt modules", async () => {
    // The exact mix the live agent produced: 40% to content, which has no
    // implemented kinds. Naive proportional allocation left 40% of the queue
    // empty and the agent under-worked all week.
    m.cycleFindOne.mockResolvedValue(
      makeCycle({ channelMix: { prospecting: 0, content: 40, engagement: 60, inbox: 0 } })
    );
    m.taskCountDocuments.mockResolvedValue(0);
    m.taskCreate.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ ...doc, _id: "t" })
    );
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

    await tick(USER);

    // 12 is QUEUE_TARGET; comments are capped at 100/7 days ≈ 14 so budget is not the limit
    expect(m.taskCreate.mock.calls.length).toBe(12);
  });

  it("spreads evenly when every implementable channel scored zero", async () => {
    m.cycleFindOne.mockResolvedValue(
      makeCycle({ channelMix: { prospecting: 0, content: 100, engagement: 0, inbox: 0 } })
    );
    m.taskCountDocuments.mockResolvedValue(0);
    m.taskCreate.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ ...doc, _id: "t" })
    );
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

    await tick(USER);

    // Rather than idling because the plan named only unbuilt work
    expect(m.taskCreate.mock.calls.length).toBeGreaterThan(0);
  });

  it("says why the queue is empty instead of leaving the user staring at zero", async () => {
    m.cycleFindOne.mockResolvedValue(
      makeCycle({ channelMix: { prospecting: 100, content: 0, engagement: 0, inbox: 0 } })
    );
    m.taskCountDocuments.mockResolvedValue(0);
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) }); // no targets
    m.taskCreate.mockResolvedValue(null);

    await tick(USER);

    expect(m.journal).toHaveBeenCalledWith(
      expect.objectContaining({
        entryType: "observation",
        text: expect.stringContaining("could not queue any work"),
      })
    );
  });

  it("does not repeat the same empty-queue explanation every tick", async () => {
    m.cycleFindOne.mockResolvedValue(
      makeCycle({ channelMix: { prospecting: 100, content: 0, engagement: 0, inbox: 0 } })
    );
    m.taskCountDocuments.mockResolvedValue(0);
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
    m.taskCreate.mockResolvedValue(null);
    m.journalExists.mockResolvedValue({ _id: "already" });

    await tick(USER);

    const observations = m.journal.mock.calls.filter(
      (c) => c[0]?.entryType === "observation"
    );
    expect(observations).toHaveLength(0);
  });

  it("does not queue a kind the current phase cannot execute", async () => {
    m.taskCountDocuments.mockResolvedValue(0);
    m.taskCreate.mockImplementation((doc) => Promise.resolve({ ...doc, _id: "t" }));
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

    await tick(USER);

    const kinds = m.taskCreate.mock.calls.map((c) => c[0].kind);
    for (const kind of kinds) {
      expect(["comment_on_feed", "like_post", "view_target_profile"]).toContain(kind);
    }
  });

  it("swallows a duplicate-key collision instead of crashing the tick", async () => {
    m.taskCountDocuments.mockResolvedValue(0);
    m.targetFindOne.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
    m.taskCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

    await expect(tick(USER)).resolves.toBeDefined();
  });
});
