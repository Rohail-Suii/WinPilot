import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserAIProvider: vi.fn(),
  journal: vi.fn(),
  remember: vi.fn(),
  decay: vi.fn(),
  recall: vi.fn(),
  taskAggregate: vi.fn(),
  taskCountDocuments: vi.fn(),
  targetCountDocuments: vi.fn(),
  targetAggregate: vi.fn(),
  threadCountDocuments: vi.fn(),
  postFind: vi.fn(),
  goalFindOne: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ai/key-manager", () => ({ getUserAIProvider: mocks.getUserAIProvider }));
vi.mock("@/lib/autopilot/journal", () => ({
  journal: mocks.journal,
  journalDigest: vi.fn().mockResolvedValue("(digest)"),
}));
vi.mock("@/lib/autopilot/memory", () => ({
  remember: mocks.remember,
  decay: mocks.decay,
  recall: mocks.recall,
}));
vi.mock("@/lib/db/models/agent-task", () => ({
  default: { aggregate: mocks.taskAggregate, countDocuments: mocks.taskCountDocuments },
}));
vi.mock("@/lib/db/models/agent-target", () => ({
  default: { countDocuments: mocks.targetCountDocuments, aggregate: mocks.targetAggregate },
}));
vi.mock("@/lib/db/models/agent-thread", () => ({
  default: { countDocuments: mocks.threadCountDocuments },
}));
vi.mock("@/lib/db/models/post", () => ({ default: { find: mocks.postFind } }));
vi.mock("@/lib/db/models/agent-goal", () => ({ default: { findOne: mocks.goalFindOne } }));
vi.mock("@/lib/db/models/agent-memory", () => ({ default: { countDocuments: vi.fn() } }));
vi.mock("@/lib/db/models/agent-cycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-cycle")>(
    "@/lib/db/models/agent-cycle"
  );
  return { ...actual, default: { findOne: vi.fn() } };
});

import { computeActuals, closeCycle } from "@/lib/autopilot/reviewer";
import type { IAgentCycle } from "@/lib/db/models/agent-cycle";

function makeCycle(overrides: Partial<IAgentCycle> = {}): IAgentCycle {
  return {
    _id: { toString: () => "cycle-1" },
    userId: "507f1f77bcf86cd799439011",
    weekNumber: 1,
    startsAt: new Date("2026-08-16T00:00:00Z"),
    endsAt: new Date("2026-08-23T00:00:00Z"),
    strategy: "Comment on niche posts to build early visibility.",
    channelMix: { prospecting: 40, content: 20, engagement: 30, inbox: 10 },
    targets: [
      { metric: "comments_posted", planned: 20 },
      { metric: "profiles_viewed", planned: 10 },
    ],
    actuals: [],
    status: "running",
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IAgentCycle;
}

const USER = "507f1f77bcf86cd799439011";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.taskAggregate.mockResolvedValue([
    { _id: "comment_on_feed", count: 12 },
    { _id: "view_target_profile", count: 4 },
  ]);
  mocks.taskCountDocuments.mockResolvedValue(1);
  mocks.targetCountDocuments.mockResolvedValue(0);
  mocks.targetAggregate.mockResolvedValue([]);
  mocks.threadCountDocuments.mockResolvedValue(0);
  mocks.postFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
  mocks.recall.mockResolvedValue([]);
  mocks.goalFindOne.mockResolvedValue({ northStar: "Land a remote React contract" });
});

describe("computeActuals", () => {
  it("derives metrics from completed task records, not from running counters", async () => {
    const actuals = await computeActuals(USER, makeCycle());

    const byMetric = Object.fromEntries(actuals.map((a) => [a.metric, a.achieved]));
    expect(byMetric.comments_posted).toBe(12);
    expect(byMetric.profiles_viewed).toBe(4);
  });

  it("records failures so a broken week visibly drags the score down", async () => {
    mocks.taskCountDocuments.mockResolvedValue(7);

    const actuals = await computeActuals(USER, makeCycle());

    expect(actuals.find((a) => a.metric === "tasks_failed")?.achieved).toBe(7);
  });

  it("reports zero for a metric with no matching tasks rather than omitting it", async () => {
    mocks.taskAggregate.mockResolvedValue([]);

    const actuals = await computeActuals(USER, makeCycle());

    expect(actuals.find((a) => a.metric === "dms_sent")?.achieved).toBe(0);
  });
});

describe("closeCycle", () => {
  it("scores the week, records the strategy change, and distils learnings", async () => {
    mocks.getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({
        score: 62,
        reviewSummary: "Hit 12 of 20 planned comments; profile views underperformed.",
        strategyDelta: "Shift 10% from prospecting to engagement — comments converted better.",
        learnings: [
          { kind: "pattern", statement: "Comments on posts under 4 hours old got replies.", confidence: 0.6 },
          { kind: "failure", statement: "Profile views alone produced no accepts.", confidence: 0.7 },
        ],
        contradicted: [],
      }),
    });

    const cycle = makeCycle();
    await closeCycle(USER, cycle);

    expect(cycle.status).toBe("closed");
    expect(cycle.score).toBe(62);
    expect(cycle.strategyDelta).toContain("Shift 10%");
    expect(mocks.remember).toHaveBeenCalledTimes(2);
    expect(mocks.journal).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: "reflection" })
    );
  });

  it("decays a learning the week's data contradicted", async () => {
    mocks.recall.mockResolvedValue([
      { _id: { toString: () => "mem-1" }, statement: "Generic comments work fine." },
    ]);
    mocks.getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({
        score: 40,
        reviewSummary: "Generic comments got no replies at all.",
        strategyDelta: "Require a specific reference in every comment.",
        learnings: [],
        contradicted: ["Generic comments work fine."],
      }),
    });

    await closeCycle(USER, makeCycle());

    expect(mocks.decay).toHaveBeenCalledWith("mem-1");
  });

  it("clamps a nonsense score from the model instead of storing it raw", async () => {
    mocks.getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockResolvedValue({
        score: 5000,
        reviewSummary: "s",
        strategyDelta: "d",
        learnings: [],
        contradicted: [],
      }),
    });

    const cycle = makeCycle();
    await closeCycle(USER, cycle);

    expect(cycle.score).toBe(100);
  });

  it("still records the numbers when no AI provider is configured", async () => {
    mocks.getUserAIProvider.mockResolvedValue(null);

    const cycle = makeCycle();
    await closeCycle(USER, cycle);

    expect(cycle.status).toBe("closed");
    expect(cycle.actuals.length).toBeGreaterThan(0);
    expect(cycle.reviewSummary).toContain("No AI provider");
    expect(mocks.remember).not.toHaveBeenCalled();
  });

  it("closes the cycle even when the review call throws", async () => {
    mocks.getUserAIProvider.mockResolvedValue({
      generateJSON: vi.fn().mockRejectedValue(new Error("provider exploded")),
    });

    const cycle = makeCycle();
    await closeCycle(USER, cycle);

    expect(cycle.status).toBe("closed");
    expect(mocks.journal).toHaveBeenCalledWith(
      expect.objectContaining({ entryType: "error" })
    );
  });

  it("is idempotent — a cycle already closed is left alone", async () => {
    const cycle = makeCycle({ status: "closed" } as Partial<IAgentCycle>);

    await closeCycle(USER, cycle);

    expect(mocks.getUserAIProvider).not.toHaveBeenCalled();
    expect(cycle.save).not.toHaveBeenCalled();
  });
});
