/**
 * The feed comment prompt.
 *
 * Feed mode is meant to comment on every post, but the voice rules on their own
 * only ever worked on technical and opinion posts. On a promotion, a conference
 * vlog or a company update there is no mechanism or failure mode to reach for,
 * so the model produced flattery — which the quality gate then rejected — or
 * declined to write anything at all. Either way the post got a bare like.
 *
 * What is pinned here is that every post type has a stated shape, and that
 * `mustEngage` genuinely removes the option of saying nothing.
 */
import { describe, it, expect } from "vitest";
import { buildFeedCommentPrompt } from "@/lib/ai/prompts/autopilot";
import type { IPersonaSnapshot } from "@/lib/db/models/agent-goal";

const persona = {
  summary: "AI and full-stack engineer",
  signatureProjects: ["a RAG pipeline over 400k support tickets"],
} as unknown as IPersonaSnapshot;

function build(over: Partial<Parameters<typeof buildFeedCommentPrompt>[0]> = {}) {
  const messages = buildFeedCommentPrompt({
    persona,
    memories: "",
    pitchOnJobPosts: true,
    post: {
      authorName: "Wajahat Gul",
      authorHeadline: "Assistant Engineering Supervisor",
      postContent: "I have been promoted to Assistant Engineering Supervisor.",
    },
    ...over,
  });
  return messages.map((m) => m.content).join("\n");
}

describe("comment shapes", () => {
  it("tells the model what a good comment looks like on every post type", () => {
    const prompt = build();

    for (const type of [
      "technical",
      "opinion",
      "personal_news",
      "hiring",
      "promotional",
      "noise",
    ]) {
      expect(prompt).toContain(type);
    }
  });

  it("says congratulating is the right move on personal news", () => {
    // Without this the model has no shape to reach for on a promotion post and
    // falls back on the flattery the taste rules ban.
    expect(build()).toMatch(/personal_news[\s\S]*congratulating them is the right move/);
  });

  it("gives even a low-substance post something concrete to respond to", () => {
    expect(build()).toMatch(/noise[\s\S]*(event|city|product|talk|milestone)/);
  });
});

describe("comment style", () => {
  it("demotes questions from a default to a last resort", () => {
    const prompt = build();

    expect(prompt).toMatch(/QUESTIONS ARE A LAST RESORT/);
    expect(prompt).toMatch(/[Nn]ever tack a question onto the end/);
  });

  it("names the audience the comment has to be worth reading for", () => {
    const prompt = build();

    expect(prompt).toMatch(/founders, hiring managers and engineering leads/);
  });

  it("requires the comment to carry something the reader can use", () => {
    const prompt = build();

    expect(prompt).toMatch(/GIVE THE READER SOMETHING/);
    expect(prompt).toMatch(/mechanism/);
    expect(prompt).toMatch(/tradeoff/);
  });

  it("still bans flattery and invented experience", () => {
    const prompt = build();

    expect(prompt).toMatch(/great post/i);
    expect(prompt).toMatch(/Never claim a project, client, employer, technology, or number/);
  });
});

describe("mustEngage", () => {
  it("removes the option of saying nothing", () => {
    const prompt = build({ mustEngage: true });

    expect(prompt).toMatch(/Opting out is not available/);
    expect(prompt).toMatch(/comment MUST be non-empty/);
    expect(prompt).not.toMatch(/Saying nothing is a good outcome/);
  });

  it("leaves the opt-out in place when it is not set", () => {
    const prompt = build();

    expect(prompt).toMatch(/Saying nothing is a good outcome/);
    expect(prompt).not.toMatch(/Opting out is not available/);
  });

  it("does not relax the rules to buy itself a comment", () => {
    const prompt = build({ mustEngage: true });

    // The escape hatch this must never become is "say something nice".
    expect(prompt).toMatch(/must NOT do is fall back on praise/);
    expect(prompt).toMatch(/every rule below still binds/);
  });
});

describe("hiring posts", () => {
  it("carries the pitch rules when pitching is on", () => {
    expect(build({ pitchOnJobPosts: true })).toMatch(/WHEN THE POST IS HIRING/);
  });

  it("tells the model not to write the link itself", () => {
    // The link is appended deterministically after generation, so a model that
    // also writes one produces a comment with the URL in it twice, or with a
    // hallucinated domain.
    const prompt = build({ pitchOnJobPosts: true });

    expect(prompt).toMatch(/Do NOT write a URL, a domain, or "link in bio"/);
    expect(prompt).toMatch(/added after you, automatically/);
  });

  it("says to comment on substance when pitching is off", () => {
    const prompt = build({ pitchOnJobPosts: false });

    expect(prompt).toMatch(/pitching is turned off/);
    expect(prompt).not.toMatch(/WHEN THE POST IS HIRING/);
  });
});

/**
 * The cache invariant.
 *
 * The system message is byte-identical across every post, which is what lets
 * the Anthropic provider mark it cacheable and bill reads at a tenth of the
 * input rate — most of an eight-fold cost reduction. Anything per-post that
 * leaks into it changes the cache prefix on every call and silently multiplies
 * the bill, with no symptom other than the invoice.
 *
 * This is the test that stops that happening.
 */
describe("prompt caching", () => {
  const OPENING = "ZZUNIQUEOPENINGZZ";

  it("keeps the system message byte-identical when only per-post fields differ", () => {
    const a = buildFeedCommentPrompt({
      persona,
      memories: "",
      pitchOnJobPosts: true,
      variety: true,
      recentOpenings: `- ${OPENING}`,
      lengthBand: "reaction",
      post: { authorName: "A", authorHeadline: "B", postContent: "one post" },
    });
    const b = buildFeedCommentPrompt({
      persona,
      memories: "",
      pitchOnJobPosts: true,
      variety: true,
      recentOpenings: "- something else entirely",
      lengthBand: "standard",
      post: { authorName: "Z", authorHeadline: "Y", postContent: "a different post" },
    });

    expect(a[0].content).toBe(b[0].content);
  });

  it("keeps recent openings out of the system message", () => {
    const [system, user] = buildFeedCommentPrompt({
      persona,
      memories: "",
      pitchOnJobPosts: true,
      variety: true,
      recentOpenings: `- ${OPENING}`,
      lengthBand: "short",
      post: { authorName: "A", authorHeadline: "B", postContent: "x" },
    });

    expect(system.content).not.toContain(OPENING);
    expect(user.content).toContain(OPENING);
  });

  it("keeps the length draw out of the system message", () => {
    const [system, user] = buildFeedCommentPrompt({
      persona,
      memories: "",
      pitchOnJobPosts: true,
      variety: true,
      lengthBand: "reaction",
      post: { authorName: "A", authorHeadline: "B", postContent: "x" },
    });

    // The glossary of what the bands mean is static and belongs in the cached
    // system block; the draw for this one post does not.
    expect(system.content).toContain('"reaction"');
    expect(system.content).not.toContain("LENGTH FOR THIS ONE");
    expect(user.content).toContain("LENGTH FOR THIS ONE: reaction");
  });
});

describe("registers", () => {
  const withVariety = () => build({ variety: true, lengthBand: "short" });

  it("names all four registers and how each sounds", () => {
    const prompt = withVariety();

    for (const register of ["analytical", "playful", "celebratory", "supportive"]) {
      expect(prompt).toContain(register);
    }
    expect(prompt).toMatch(/independent of what the post is about/);
  });

  it("tells it not to explain a joke", () => {
    expect(withVariety()).toMatch(/playful[\s\S]*[Nn]ever analyse a joke/);
  });

  it("forbids advice and silver linings on a setback", () => {
    // The riskiest comment the agent writes. A tone-deaf automated reply under
    // a layoff post is the one that gets screenshotted.
    const prompt = withVariety();

    expect(prompt).toMatch(/supportive[\s\S]*No advice they did not ask for/);
    expect(prompt).toMatch(/supportive[\s\S]*no silver lining/);
    expect(prompt).toMatch(/supportive[\s\S]*never a word about your own availability/);
  });

  it("keeps the banned phrases absolute in every register", () => {
    const prompt = withVariety();

    expect(prompt).toMatch(/BANNED IN EVERY REGISTER/);
    expect(prompt).toMatch(/being warm is not a licence to reach for them/);
  });

  it("asks for the register in the JSON schema", () => {
    expect(withVariety()).toMatch(/"register": "analytical"\|"playful"/);
  });
});

describe("advice tone", () => {
  it("asks it to share experience rather than instruct", () => {
    const prompt = build();

    expect(prompt).toMatch(/SHARE EXPERIENCE, DO NOT INSTRUCT/);
    expect(prompt).toMatch(/more senior than you/);
  });
});

describe("variety turned off", () => {
  it("drops the register and length sections entirely", () => {
    const [system, user] = buildFeedCommentPrompt({
      persona,
      memories: "",
      pitchOnJobPosts: true,
      variety: false,
      recentOpenings: "- an opening",
      lengthBand: "reaction",
      post: { authorName: "A", authorHeadline: "B", postContent: "x" },
    });

    // The rollback path: one analytical voice, one length, no history block.
    expect(system.content).not.toContain('"register"');
    expect(system.content).not.toContain("LENGTH —");
    expect(user.content).not.toContain("LENGTH FOR THIS ONE");
    expect(user.content).not.toContain("an opening");
  });
});
