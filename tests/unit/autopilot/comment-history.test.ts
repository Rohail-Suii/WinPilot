/**
 * Comment history: what stops every comment sounding like the last one.
 *
 * The agent used to generate each comment in complete isolation, so with one
 * persona, one prompt and one temperature, they all opened the same way and ran
 * the same length. Read as a sequence they were obviously machine-written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ find: vi.fn() }));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/models/activity-log", () => ({ default: { find: m.find } }));

import {
  pickLengthBand,
  recentComments,
  renderRecentOpenings,
  type RecentComment,
} from "@/lib/autopilot/comment-history";

const USER = "507f1f77bcf86cd799439011";

function rows(details: Record<string, unknown>[]) {
  m.find.mockReturnValue({
    sort: () => ({
      limit: () => ({
        select: () => ({ lean: vi.fn().mockResolvedValue(details.map((d) => ({ details: d }))) }),
      }),
    }),
  });
}

const of = (...comments: string[]): RecentComment[] => comments.map((comment) => ({ comment }));

beforeEach(() => vi.clearAllMocks());

describe("recentComments", () => {
  it("reads the comment text back off the activity log", async () => {
    rows([{ comment: "the part that bites is the retry loop", postType: "technical" }]);

    const recent = await recentComments(USER);

    expect(recent).toEqual([
      { comment: "the part that bites is the retry loop", postType: "technical", angle: undefined },
    ]);
  });

  it("asks only for this account's own autopilot comments", async () => {
    rows([]);
    await recentComments(USER);

    const [filter] = m.find.mock.calls[0];
    expect(filter.userId).toBe(USER);
    expect(filter.module).toBe("autopilot");
    expect(filter.action.$in).toContain("comment_on_feed");
    expect(filter["details.comment"]).toEqual({ $exists: true, $nin: [null, ""] });
  });

  it("drops rows with no comment on them", async () => {
    // Like-only engagements are logged too, with no comment field.
    rows([{ comment: "a real one" }, { comment: "   " }]);
    expect(await recentComments(USER)).toHaveLength(1);
  });

  it("returns nothing rather than throwing when the database is unhappy", async () => {
    // A Mongo hiccup must cost the variety, never the comment.
    m.find.mockImplementation(() => {
      throw new Error("connection reset");
    });
    expect(await recentComments(USER)).toEqual([]);
  });
});

describe("renderRecentOpenings", () => {
  it("keeps only the opening words, which is where the sameness lives", () => {
    const out = renderRecentOpenings(
      of("the part that bites is the retry loop and the backoff behind it")
    );
    expect(out).toBe("- the part that bites is the");
  });

  it("collapses near-identical openings to one line", () => {
    // Ten variations of the same opening would otherwise be their own wall of
    // sameness, and would crowd out the openings worth avoiding.
    const out = renderRecentOpenings(
      of(
        "the part that bites is the retry loop",
        "the part that bites is the chunking",
        "the part that bites is the index"
      )
    );
    expect(out.split("\n")).toHaveLength(1);
  });

  it("flattens newlines so the block cannot be broken open", () => {
    const out = renderRecentOpenings(of("first\nsecond\nthird fourth fifth sixth seventh"));
    expect(out).not.toContain("\n- \n");
    expect(out.split("\n")).toHaveLength(1);
  });

  it("caps how many it renders", () => {
    const many = of(...Array.from({ length: 30 }, (_, i) => `opening number ${i} here`));
    expect(renderRecentOpenings(many, 5).split("\n")).toHaveLength(5);
  });

  it("renders nothing for a fresh account", () => {
    expect(renderRecentOpenings([])).toBe("");
  });
});

describe("pickLengthBand", () => {
  it("always returns a real band", () => {
    for (let i = 0; i < 50; i++) {
      expect(["reaction", "short", "standard"]).toContain(pickLengthBand([]));
    }
  });

  it("steers away from a run of the same length", () => {
    // Fifteen long comments in a row is exactly the pattern the user noticed.
    const allStandard = of(...Array.from({ length: 15 }, () => "x".repeat(200)));

    const picks = new Set(Array.from({ length: 40 }, () => pickLengthBand(allStandard)));
    expect(picks.has("reaction")).toBe(true);
    expect(picks.has("short")).toBe(true);
  });

  it("does not produce a perfectly balanced sequence, which is its own tell", () => {
    const allShort = of(...Array.from({ length: 15 }, () => "x".repeat(80)));
    const picks = Array.from({ length: 60 }, () => pickLengthBand(allShort));

    // History says "short" is over-represented, so it should mostly be avoided
    // — but not with machine reliability.
    expect(picks.some((p) => p === "short")).toBe(true);
    expect(picks.filter((p) => p === "short").length).toBeLessThan(picks.length / 2);
  });
});
