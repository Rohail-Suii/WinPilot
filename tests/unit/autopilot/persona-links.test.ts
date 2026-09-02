/**
 * The portfolio link that closes a pitch.
 *
 * It comes out of the career profile, which is filled in by hand, so it
 * arrives in whatever shape the user typed. Anything that is not a real
 * http(s) URL has to be dropped rather than pasted into a public comment on a
 * hiring post.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ careerFindOne: vi.fn() }));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/models/career-profile", () => ({ default: { findOne: m.careerFindOne } }));
vi.mock("@/lib/db/models/profile-analysis", () => ({
  default: { findOne: () => ({ lean: vi.fn().mockResolvedValue(null) }) },
}));
vi.mock("@/lib/db/models/user", () => ({
  default: { findById: () => ({ lean: vi.fn().mockResolvedValue(null) }) },
}));

import { buildPersonaSnapshot } from "@/lib/autopilot/persona";

function profileWith(portfolio: unknown) {
  m.careerFindOne.mockReturnValue({
    lean: vi.fn().mockResolvedValue({
      summary: "AI and full-stack engineer",
      skills: [],
      experience: [],
      projects: [],
      contactInfo: { portfolio },
    }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("portfolioUrl", () => {
  it("carries a normal URL through", async () => {
    profileWith("http://rohail.systems/");
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("http://rohail.systems");
  });

  it("adds the scheme when the profile has a bare domain", async () => {
    profileWith("rohail.systems");
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("https://rohail.systems");
  });

  it("tolerates stray whitespace", async () => {
    profileWith("  https://rohail.systems  ");
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("https://rohail.systems");
  });

  it("keeps a path", async () => {
    profileWith("https://rohail.systems/work");
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("https://rohail.systems/work");
  });

  it("drops anything that is not a URL", async () => {
    for (const junk of ["", "   ", "not a url", "my portfolio", "localhost"]) {
      profileWith(junk);
      expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("");
    }
  });

  it("drops a non-http scheme rather than posting it", async () => {
    profileWith("javascript:alert(1)");
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("");
  });

  it("is empty when the profile has no portfolio at all", async () => {
    profileWith(undefined);
    expect((await buildPersonaSnapshot("u1")).portfolioUrl).toBe("");
  });
});
