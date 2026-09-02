import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The send pipeline's guard rails.
 *
 * Each of these is a way the feature could damage the user rather than merely
 * fail: mailing the same recruiter twice, mailing an address that will bounce,
 * sending an application with no resume attached, or burning the daily quota in
 * one burst. The happy path is here too, mostly to pin down that a successful
 * send is what marks the record `sent` — the counter every other rule reads.
 */

const m = vi.hoisted(() => ({
  countDocuments: vi.fn(),
  findOne: vi.fn(),
  masterFindOne: vi.fn(),
  sendApplicationEmail: vi.fn(),
  canDeliverTo: vi.fn(),
  notificationCreate: vi.fn(),
  activityCreate: vi.fn(),
  journal: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({ default: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sse", () => ({ pushSseEvent: vi.fn() }));
vi.mock("@/lib/autopilot/journal", () => ({ journal: m.journal }));
vi.mock("@/lib/db/models/job-outreach", () => ({
  default: {
    countDocuments: m.countDocuments,
    findOne: m.findOne,
    findOneAndUpdate: vi.fn(),
    distinct: vi.fn(),
    updateMany: vi.fn(),
  },
  PENDING_OUTREACH_STATUSES: ["queued", "sending"],
}));
vi.mock("@/lib/db/models/master-resume", () => ({ default: { findOne: m.masterFindOne } }));
vi.mock("@/lib/db/models/user", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/lib/db/models/career-profile", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/db/models/agent-goal", () => ({ default: { findOne: vi.fn() } }));
vi.mock("@/lib/db/models/notification", () => ({ default: { create: m.notificationCreate } }));
vi.mock("@/lib/db/models/activity-log", () => ({ default: { create: m.activityCreate } }));
vi.mock("@/lib/ai/key-manager", () => ({ getUserAIProvider: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/autopilot/persona", () => ({ buildPersonaSnapshot: vi.fn() }));
vi.mock("@/lib/ai/usage-history", () => ({ buildAIMetadata: vi.fn(), saveAIUsageLog: vi.fn() }));
vi.mock("@/lib/services/resume-service", () => ({
  getDefaultResume: vi.fn(),
  resumeToText: vi.fn(),
}));
vi.mock("@/lib/email/gmail-smtp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/gmail-smtp")>(
    "@/lib/email/gmail-smtp"
  );
  return { ...actual, sendApplicationEmail: m.sendApplicationEmail };
});
vi.mock("@/lib/email/deliverability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/deliverability")>(
    "@/lib/email/deliverability"
  );
  return { ...actual, canDeliverTo: m.canDeliverTo };
});

import { sendOneApplication, checkPacing, isAcceptedRefusal } from "@/lib/outreach/sender";
import type { IJobOutreach } from "@/lib/db/models/job-outreach";

const USER_ID = "507f1f77bcf86cd799439011";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    gmailUser: "me@gmail.com",
    appPassword: "apppassword123456",
    fromName: "Rohail Ahmed",
    signature: "",
    dailyLimit: 20,
    minGapMinutes: 6,
    ccSelf: true,
    minConfidence: 0.6,
    strictSkillMatch: false,
    credentialSource: "user" as const,
    ...overrides,
  };
}

/** A claimed record, with the save() the pipeline calls. */
function record(overrides: Partial<IJobOutreach> = {}) {
  return {
    _id: "rec1",
    userId: { toString: () => USER_ID },
    recipientEmail: "hr@nexus95.com",
    status: "sending",
    postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1/",
    postContent: "Nexus95 is hiring a Website Developer. Send your CV to hr@nexus95.com",
    company: "Nexus95",
    roleTitle: "Website Developer",
    authorName: "Nexus95",
    subject: "Website Developer — Rohail Ahmed",
    body: "Hi, I saw your post about the Website Developer role. My resume is attached.",
    attempts: 0,
    maxAttempts: 4,
    spamIssues: [],
    history: [] as { at: Date; ok: boolean; error?: string }[],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IJobOutreach & { save: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.countDocuments.mockResolvedValue(0);
  m.findOne.mockReturnValue({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }), select: () => ({ lean: () => Promise.resolve(null) }), lean: () => Promise.resolve(null) });
  m.masterFindOne.mockReturnValue({
    lean: () => Promise.resolve({ filename: "Rohail_Ahmed.pdf", contentType: "application/pdf", data: Buffer.from("%PDF-1.4") }),
    select: () => ({ lean: () => Promise.resolve({ filename: "Rohail_Ahmed.pdf" }) }),
  });
  m.canDeliverTo.mockResolvedValue({ ok: true });
  m.sendApplicationEmail.mockResolvedValue({ messageId: "<abc@gmail.com>", accepted: ["hr@nexus95.com"], rejected: [] });
  m.notificationCreate.mockResolvedValue({});
  m.activityCreate.mockResolvedValue({});
  m.journal.mockResolvedValue(null);
});

describe("checkPacing", () => {
  it("stops once the daily limit is used up", async () => {
    m.countDocuments.mockResolvedValue(20);
    const result = await checkPacing(USER_ID, settings({ dailyLimit: 20 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily limit/i);
  });

  it("keeps a minimum gap between sends", async () => {
    m.countDocuments.mockResolvedValue(3);
    m.findOne.mockReturnValue({
      sort: () => ({ select: () => ({ lean: () => Promise.resolve({ sentAt: new Date(Date.now() - 60_000) }) }) }),
    });

    const result = await checkPacing(USER_ID, settings({ minGapMinutes: 6 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/next one in \d+ min/);
  });

  it("allows a send once the gap has passed and there is quota left", async () => {
    m.countDocuments.mockResolvedValue(3);
    m.findOne.mockReturnValue({
      sort: () => ({ select: () => ({ lean: () => Promise.resolve({ sentAt: new Date(Date.now() - 60 * 60_000) }) }) }),
    });

    expect((await checkPacing(USER_ID, settings())).allowed).toBe(true);
  });
});

describe("sendOneApplication", () => {
  it("sends the mail with the user's own resume attached and marks it sent", async () => {
    const item = record();
    const outcome = await sendOneApplication(item, settings());

    expect(outcome.ok).toBe(true);
    expect(item.status).toBe("sent");
    expect(item.messageId).toBe("<abc@gmail.com>");

    const call = m.sendApplicationEmail.mock.calls[0][0];
    expect(call.to).toBe("hr@nexus95.com");
    expect(call.attachments[0].filename).toBe("Rohail_Ahmed.pdf");
    expect(call.bccSelf).toBe(true);
    // The From has to be the authenticated account, or Gmail rewrites it and
    // the alignment that makes DMARC pass is lost.
    expect(call.credentials.user).toBe("me@gmail.com");
  });

  it("will not write to a recruiter it has already applied to this month", async () => {
    m.findOne.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ sentAt: new Date() }) }),
    });

    const item = record();
    const outcome = await sendOneApplication(item, settings());

    expect(outcome.ok).toBe(false);
    expect(item.status).toBe("skipped");
    expect(m.sendApplicationEmail).not.toHaveBeenCalled();
  });

  it("refuses an address that would bounce, rather than spending reputation on it", async () => {
    m.canDeliverTo.mockResolvedValue({ ok: false, reason: "nexus95.com has no mail server" });

    const item = record();
    const outcome = await sendOneApplication(item, settings());

    expect(item.status).toBe("failed");
    expect(outcome.reason).toMatch(/no mail server/);
    expect(m.sendApplicationEmail).not.toHaveBeenCalled();
  });

  it("holds the application back when no resume has been uploaded", async () => {
    m.masterFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });

    const item = record();
    await sendOneApplication(item, settings());

    expect(item.status).toBe("needs_review");
    expect(item.lastError).toMatch(/master resume/i);
    expect(m.sendApplicationEmail).not.toHaveBeenCalled();
  });

  it("retries a transient SMTP failure with backoff", async () => {
    m.sendApplicationEmail.mockRejectedValue(
      Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" })
    );

    const item = record();
    const outcome = await sendOneApplication(item, settings());

    expect(outcome.status).toBe("queued");
    expect(item.attempts).toBe(1);
    expect(item.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("gives up on a rejected app password instead of retrying it forever", async () => {
    m.sendApplicationEmail.mockRejectedValue(
      Object.assign(new Error("535-5.7.8 Username and Password not accepted"), { code: "EAUTH" })
    );

    const item = record();
    const outcome = await sendOneApplication(item, settings());

    expect(outcome.status).toBe("failed");
    expect(item.lastError).toMatch(/App Password/i);
    expect(m.notificationCreate).toHaveBeenCalled();
  });

  it("stops retrying once the attempt budget is spent", async () => {
    m.sendApplicationEmail.mockRejectedValue(
      Object.assign(new Error("connection timed out"), { code: "ETIMEDOUT" })
    );

    const item = record({ attempts: 3, maxAttempts: 4 } as Partial<IJobOutreach>);
    const outcome = await sendOneApplication(item, settings());

    expect(outcome.status).toBe("failed");
  });
});

describe("isAcceptedRefusal", () => {
  it("accepts the grounds the prompt actually offers", () => {
    expect(isAcceptedRefusal("The role is for a Registered Nurse, which is a different profession.")).toBe(true);
    expect(isAcceptedRefusal("This is not a job posting.")).toBe(true);
    expect(isAcceptedRefusal("The post is for a course, not a job opening.")).toBe(true);
    expect(isAcceptedRefusal("Applications are closed.")).toBe(true);
    expect(isAcceptedRefusal("The author is looking for work themselves.")).toBe(true);
  });

  it("challenges a refusal over a missing tool, however it is phrased", () => {
    expect(isAcceptedRefusal("The role requires WordPress experience, which I do not have.")).toBe(false);
    expect(isAcceptedRefusal("Lacks the required five years of Elementor.")).toBe(false);
    expect(isAcceptedRefusal("Not a strong enough match for the listed stack.")).toBe(false);
    expect(isAcceptedRefusal("")).toBe(false);
  });
});
