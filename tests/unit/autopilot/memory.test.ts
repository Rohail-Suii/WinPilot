import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/models/agent-memory", () => ({
  default: {
    find: mocks.find,
    create: mocks.create,
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
  },
}));

import { remember, reinforce, decay, recall, recallBlock } from "@/lib/autopilot/memory";

/** `find()` is used two ways: bare (dedupe scan) and chained (recall). */
function mockFind({ bare = [], chained = [] }: { bare?: unknown[]; chained?: unknown[] }) {
  mocks.find.mockImplementation(() => {
    const result = {
      limit: vi.fn().mockResolvedValue(bare),
      sort: () => ({ limit: () => ({ lean: vi.fn().mockResolvedValue(chained) }) }),
    };
    return result;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFind({});
  mocks.create.mockImplementation((doc) => Promise.resolve({ ...doc, _id: "new-mem" }));
});

describe("remember", () => {
  it("stores a new learning", async () => {
    await remember({
      userId: "u1",
      kind: "insight",
      statement: "Comments referencing a specific line of the post get replies.",
      confidence: 0.6,
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "insight", confidence: 0.6 })
    );
  });

  it("reinforces a near-duplicate instead of accumulating copies week after week", async () => {
    const existing = {
      _id: { toString: () => "mem-1" },
      statement: "Comments referencing a specific line of the post get replies.",
      confidence: 0.5,
      hitCount: 1,
      evidence: [],
      save: vi.fn().mockResolvedValue(undefined),
    };
    mockFind({ bare: [existing] });
    mocks.findById.mockResolvedValue(existing);

    await remember({
      userId: "u1",
      kind: "insight",
      // Same claim, different wording — must not create a second row
      statement: "Comments which reference a specific line from the post get replies.",
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(existing.hitCount).toBe(2);
    expect(existing.confidence).toBeGreaterThan(0.5);
  });

  it("keeps genuinely different learnings apart", async () => {
    mockFind({
      bare: [
        {
          _id: { toString: () => "mem-1" },
          statement: "Comments referencing a specific line of the post get replies.",
        },
      ],
    });

    await remember({
      userId: "u1",
      kind: "failure",
      statement: "Connection requests sent without a note were ignored entirely.",
    });

    expect(mocks.create).toHaveBeenCalled();
  });

  it("ignores an empty statement rather than storing a blank memory", async () => {
    const result = await remember({ userId: "u1", kind: "fact", statement: "   " });

    expect(result).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("reinforce", () => {
  it("raises confidence towards 1 without ever exceeding it", async () => {
    const memory = {
      _id: "mem-1",
      confidence: 0.95,
      hitCount: 4,
      evidence: [],
      lastConfirmedAt: new Date(0),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.findById.mockResolvedValue(memory);

    await reinforce("mem-1");

    expect(memory.confidence).toBeGreaterThan(0.95);
    expect(memory.confidence).toBeLessThanOrEqual(1);
  });

  it("caps stored evidence so a long-lived memory cannot grow unbounded", async () => {
    const memory = {
      _id: "mem-1",
      confidence: 0.5,
      hitCount: 1,
      evidence: Array.from({ length: 20 }, (_, i) => ({ type: "cycle", refId: `c${i}` })),
      lastConfirmedAt: new Date(0),
      save: vi.fn().mockResolvedValue(undefined),
    };
    mocks.findById.mockResolvedValue(memory);

    await reinforce("mem-1", [{ type: "cycle", refId: "c-new" }]);

    expect(memory.evidence).toHaveLength(20);
    expect(memory.evidence.at(-1)).toEqual({ type: "cycle", refId: "c-new" });
  });
});

describe("decay", () => {
  it("multiplies confidence down when a learning is contradicted", async () => {
    await decay("mem-1");

    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith("mem-1", [
      { $set: { confidence: { $multiply: ["$confidence", 0.5] } } },
    ]);
  });
});

describe("recall", () => {
  it("filters out learnings below the confidence floor", async () => {
    mockFind({ chained: [] });

    await recall("u1");

    const filter = mocks.find.mock.calls[0][0];
    expect(filter.confidence.$gte).toBeGreaterThan(0);
  });

  it("returns a usable placeholder instead of an empty prompt block", async () => {
    mockFind({ chained: [] });

    const block = await recallBlock("u1");

    expect(block).toContain("no learnings recorded yet");
  });

  it("formats learnings with their confidence so the model can weigh them", async () => {
    mockFind({
      chained: [{ kind: "pattern", confidence: 0.82, statement: "Tuesday posts outperform." }],
    });

    const block = await recallBlock("u1");

    expect(block).toContain("pattern");
    expect(block).toContain("0.82");
    expect(block).toContain("Tuesday posts outperform.");
  });
});
