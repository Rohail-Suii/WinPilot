import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  taskFindOneAndUpdate: vi.fn(),
  taskFind: vi.fn(),
  taskFindOne: vi.fn(),
  taskCreate: vi.fn(),
  taskCountDocuments: vi.fn(),
  sendToExtension: vi.fn(),
  pushSseEvent: vi.fn(),
  journal: vi.fn(),
  configFindOne: vi.fn(),
  goalFindOne: vi.fn(),
  cycleFindOne: vi.fn(),
  targetFindOne: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/websocket/server", () => ({
  sendToExtension: mocks.sendToExtension,
  isExtensionConnected: () => true,
}));
vi.mock("@/lib/sse", () => ({ pushSseEvent: mocks.pushSseEvent }));
vi.mock("@/lib/autopilot/journal", () => ({
  journal: mocks.journal,
  journalDigest: vi.fn().mockResolvedValue("(none)"),
  recentJournal: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/autopilot/memory", () => ({
  recallBlock: vi.fn().mockResolvedValue("(none)"),
}));
vi.mock("@/lib/autopilot/reviewer", () => ({ closeCycle: vi.fn() }));
vi.mock("@/lib/ai/key-manager", () => ({ getUserAIProvider: vi.fn().mockResolvedValue(null) }));

vi.mock("@/lib/db/models/agent-task", () => ({
  default: {
    findOneAndUpdate: mocks.taskFindOneAndUpdate,
    find: mocks.taskFind,
    findOne: mocks.taskFindOne,
    create: mocks.taskCreate,
    countDocuments: mocks.taskCountDocuments,
  },
  ACTIVE_TASK_STATES: ["queued", "dispatched", "running"],
}));
vi.mock("@/lib/db/models/agent-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-config")>(
    "@/lib/db/models/agent-config"
  );
  return { ...actual, default: { findOne: mocks.configFindOne } };
});
vi.mock("@/lib/db/models/agent-goal", () => ({ default: { findOne: mocks.goalFindOne } }));
vi.mock("@/lib/db/models/agent-cycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/models/agent-cycle")>(
    "@/lib/db/models/agent-cycle"
  );
  return { ...actual, default: { findOne: mocks.cycleFindOne, create: vi.fn() } };
});
vi.mock("@/lib/db/models/agent-target", () => ({
  default: { findOne: mocks.targetFindOne, aggregate: vi.fn().mockResolvedValue([]) },
  ACTIVE_STAGES: [],
}));
vi.mock("@/lib/db/models/career-profile", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/db/models/profile-analysis", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/db/models/user", () => ({ default: { findById: vi.fn() } }));

import { dispatch, pickNextTask } from "@/lib/autopilot/planner";
import type { IAgentTask } from "@/lib/db/models/agent-task";

function makeTask(overrides: Partial<IAgentTask> = {}): IAgentTask {
  return {
    _id: { toString: () => "task-1" },
    userId: "u1",
    kind: "comment_on_feed",
    payload: { keyword: "nextjs" },
    state: "queued",
    rationale: "engagement share",
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IAgentTask;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendToExtension.mockReturnValue(true);
});

describe("dispatch", () => {
  it("claims the task atomically before sending it", async () => {
    const claimed = makeTask({ state: "dispatched" } as Partial<IAgentTask>);
    mocks.taskFindOneAndUpdate.mockResolvedValue(claimed);

    const ok = await dispatch("u1", makeTask());

    expect(ok).toBe(true);
    // The claim must be conditional on the task still being queued
    expect(mocks.taskFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ state: "queued" }),
      expect.anything(),
      expect.anything()
    );
    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ command: "RUN_TASK", kind: "comment_on_feed" })
    );
  });

  it("sends nothing when another tick already claimed the task", async () => {
    // Second concurrent tick: the conditional update matches no document
    mocks.taskFindOneAndUpdate.mockResolvedValue(null);

    const ok = await dispatch("u1", makeTask());

    expect(ok).toBe(false);
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it("returns the task to the queue when the extension cannot be reached", async () => {
    const claimed = makeTask({ state: "dispatched" } as Partial<IAgentTask>);
    mocks.taskFindOneAndUpdate.mockResolvedValue(claimed);
    mocks.sendToExtension.mockReturnValue(false);

    const ok = await dispatch("u1", makeTask());

    expect(ok).toBe(false);
    expect(claimed.state).toBe("queued");
    expect(claimed.save).toHaveBeenCalled();
  });

  it("pushes the dispatch to the dashboard so the queue view stays live", async () => {
    mocks.taskFindOneAndUpdate.mockResolvedValue(makeTask({ state: "dispatched" } as Partial<IAgentTask>));

    await dispatch("u1", makeTask());

    expect(mocks.pushSseEvent).toHaveBeenCalledWith(
      "u1",
      "autopilot:task",
      expect.objectContaining({ state: "dispatched" })
    );
  });
});

describe("pickNextTask", () => {
  it("only considers queued tasks that are already due", async () => {
    const sort = vi.fn().mockResolvedValue(null);
    mocks.taskFindOne.mockReturnValue({ sort });

    await pickNextTask("u1");

    const filter = mocks.taskFindOne.mock.calls[0][0];
    expect(filter.state).toBe("queued");
    expect(filter.scheduledFor.$lte).toBeInstanceOf(Date);
    // Highest priority first, then oldest scheduled
    expect(sort).toHaveBeenCalledWith({ priority: -1, scheduledFor: 1 });
  });
});
