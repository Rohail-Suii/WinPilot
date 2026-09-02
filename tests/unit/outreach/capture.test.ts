import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The branch that decides what happens to a hiring post.
 *
 * Three outcomes matter and each is a different promise to the user: an address
 * plus sending turned on means "I will apply for you"; no address means "here
 * is the link, you apply"; and anything unconfident or unconfigured means "I
 * found this but I am not acting on it". Getting these confused is how an
 * application silently never gets sent.
 */

const m = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
  userFindById: vi.fn(),
  careerFindOne: vi.fn(),
  notificationCreate: vi.fn(),
  journal: vi.fn(),
  getOutreachSettings: vi.fn(),
  loadRelevanceProfile: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sse", () => ({ pushSseEvent: vi.fn() }));
vi.mock("@/lib/autopilot/journal", () => ({ journal: m.journal }));
vi.mock("@/lib/db/models/job-outreach", () => ({
  default: { findOne: m.findOne, create: m.create },
}));
vi.mock("@/lib/db/models/user", () => ({ default: { findById: m.userFindById } }));
vi.mock("@/lib/db/models/career-profile", () => ({ default: { findOne: m.careerFindOne } }));
vi.mock("@/lib/db/models/notification", () => ({ default: { create: m.notificationCreate } }));
vi.mock("@/lib/outreach/config", () => ({ getOutreachSettings: m.getOutreachSettings }));
// The real relevance scoring is exercised here — only the database read behind
// it is faked, so these cases test the gate the user actually gets.
vi.mock("@/lib/outreach/relevance-profile", () => ({
  loadRelevanceProfile: m.loadRelevanceProfile,
}));

import { captureHiringPost } from "@/lib/outreach/capture";

const USER_ID = "507f1f77bcf86cd799439011";

const HIRING_WITH_EMAIL = {
  postKey: "winpilot:post:abc",
  postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
  postContent:
    "Nexus95 is hiring a Website Developer on project basis! Requirements: WordPress, Elementor, PHP. Apply Here: Send your updated CV and portfolio to hr@nexus95.com #Hiring",
  authorName: "Nexus95",
  authorHeadline: "Software house",
  postLinks: [{ href: "mailto:hr@nexus95.com" }],
};

/** `Model.findOne().select().lean()` resolving to whatever is handed in. */
function chainTo(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    gmailUser: "me@gmail.com",
    appPassword: "secret",
    fromName: "Me",
    signature: "",
    dailyLimit: 20,
    minGapMinutes: 6,
    ccSelf: true,
    minConfidence: 0.6,
    strictSkillMatch: false,
    credentialSource: "user",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.findOne.mockReturnValue(chainTo(null));
  m.userFindById.mockReturnValue(chainTo({ email: "me@gmail.com" }));
  m.careerFindOne.mockReturnValue(chainTo({ contactInfo: { email: "me@gmail.com" } }));
  m.notificationCreate.mockResolvedValue({});
  m.journal.mockResolvedValue(null);
  m.getOutreachSettings.mockResolvedValue(settings());
  m.loadRelevanceProfile.mockResolvedValue({
    skills: ["React", "Next.js", "Node.js", "TypeScript", "MongoDB", "Tailwind CSS"],
    titles: ["Full-Stack Engineer", "Frontend Engineer"],
  });
  m.create.mockImplementation((doc: Record<string, unknown>) =>
    Promise.resolve({ ...doc, _id: { toString: () => "rec1" } })
  );
});

describe("captureHiringPost", () => {
  it("queues an application when the post gives an address and sending is on", async () => {
    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.captured).toBe(true);
    expect(result.status).toBe("queued");
    expect(result.channel).toBe("email");

    const written = m.create.mock.calls[0][0];
    expect(written.recipientEmail).toBe("hr@nexus95.com");
    expect(written.roleTitle).toBe("Website Developer");
    expect(written.nextAttemptAt).toBeInstanceOf(Date);
  });

  it("saves the link instead when there is no address on the post", async () => {
    const result = await captureHiringPost({
      userId: USER_ID,
      post: {
        ...HIRING_WITH_EMAIL,
        postKey: "winpilot:post:form",
        postContent:
          "We are hiring a Backend Engineer. Full-time, remote. Apply here: https://forms.gle/abc123",
        postLinks: [{ href: "https://forms.gle/abc123" }],
      },
    });

    expect(result.status).toBe("needs_manual");
    expect(result.channel).toBe("link");

    const written = m.create.mock.calls[0][0];
    expect(written.applyLinks).toEqual(["https://forms.gle/abc123"]);
    expect(written.recipientEmail).toBeUndefined();
  });

  it("still records an opening that offers no route at all, so the post is not lost", async () => {
    const result = await captureHiringPost({
      userId: USER_ID,
      post: {
        postKey: "winpilot:post:dm",
        postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:9/",
        postContent:
          "We are hiring a Senior React Engineer, full-time and remote. Requirements: five years of React. DM me if interested in the role.",
        authorName: "Acme",
      },
    });

    expect(result.status).toBe("needs_manual");
    expect(result.channel).toBe("none");
  });

  it("holds an address for review when sending is turned off", async () => {
    m.getOutreachSettings.mockResolvedValue(settings({ enabled: false }));

    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.status).toBe("needs_review");
    const written = m.create.mock.calls[0][0];
    expect(written.nextAttemptAt).toBeUndefined();
  });

  it("holds an address for review when the post only just reads as hiring", async () => {
    // One weak signal and nothing else: enough to record, not enough to send
    // unattended at the default confidence floor.
    const result = await captureHiringPost({
      userId: USER_ID,
      post: {
        postKey: "winpilot:post:thin",
        postContent: "We are hiring. Write to hr@acme.io if that sounds like you.",
        authorName: "Acme",
      },
    });

    expect(result.status).toBe("needs_review");
    expect(m.create.mock.calls[0][0].recipientEmail).toBe("hr@acme.io");
  });

  it("never writes to the user's own address", async () => {
    m.userFindById.mockReturnValue(chainTo({ email: "hr@nexus95.com" }));

    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.status).toBe("needs_manual");
    expect(m.create.mock.calls[0][0].recipientEmail).toBeUndefined();
  });

  it("does nothing for a post that is not an opening, and touches no database", async () => {
    const result = await captureHiringPost({
      userId: USER_ID,
      post: {
        postKey: "winpilot:post:tech",
        postContent:
          "Wrote up how we halved our p99 latency last quarter. The trick was batching the fan-out reads.",
        authorName: "Someone",
      },
    });

    expect(result.captured).toBe(false);
    expect(m.findOne).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("is a no-op the second time the feed shows the same post", async () => {
    m.findOne.mockReturnValue(
      chainTo({ _id: { toString: () => "rec1" }, status: "sent", channel: "email" })
    );

    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.captured).toBe(false);
    expect(result.status).toBe("sent");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("does not apply for a job in someone else's profession", async () => {
    const result = await captureHiringPost({
      userId: USER_ID,
      post: {
        postKey: "winpilot:post:nurse",
        postContent:
          "We are hiring a Registered Nurse for our night shift. Requirements: valid nursing licence, two years of ICU experience. Send your CV to hr@clinic.com",
        authorName: "City Clinic",
      },
    });

    expect(result.status).toBe("skipped");
    const written = m.create.mock.calls[0][0];
    expect(written.lastError).toMatch(/not your line of work/i);
    // Recorded rather than dropped, so the decision can be seen and reversed.
    expect(written.recipientEmail).toBe("hr@clinic.com");
    expect(m.notificationCreate).not.toHaveBeenCalled();
  });

  it("still applies inside the user's own field when the stack is unfamiliar", async () => {
    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    // The Nexus95 post asks for WordPress, Elementor and PHP — none of which
    // are in the fixture profile. It is still a web development job.
    expect(result.status).toBe("queued");
    expect(m.create.mock.calls[0][0].matchedSkills).toEqual([]);
  });

  it("holds an in-field post back when strict skill matching is on", async () => {
    m.getOutreachSettings.mockResolvedValue(settings({ strictSkillMatch: true }));

    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.status).toBe("skipped");
    expect(m.create.mock.calls[0][0].lastError).toMatch(/strict matching/i);
  });

  it("records which of the user's skills a matching post asked for", async () => {
    await captureHiringPost({
      userId: USER_ID,
      post: {
        postKey: "winpilot:post:react",
        postContent:
          "We are hiring a Frontend Engineer. Requirements: React, Next.js and TypeScript, three years of experience. Send your CV to jobs@acme.io",
        authorName: "Acme",
      },
    });

    const written = m.create.mock.calls[0][0];
    expect(written.status).toBe("queued");
    expect(written.matchedSkills).toEqual(expect.arrayContaining(["React", "Next.js", "TypeScript"]));
    expect(written.relevanceScore).toBeGreaterThan(0);
  });

  it("treats a lost race on the unique index as a duplicate, not a failure", async () => {
    m.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

    const result = await captureHiringPost({ userId: USER_ID, post: HIRING_WITH_EMAIL });

    expect(result.captured).toBe(false);
    expect(result.reason).toMatch(/already recorded/i);
  });
});
