/**
 * Writing and sending the applications the capture step queued.
 *
 * This runs off the feed sweep's critical path, on its own clock, for two
 * reasons. Pacing: sending has to be spread out over hours, and the sweep
 * cannot wait. And failure isolation: SMTP being down, or a draft failing its
 * spam check, must never fail the LinkedIn task that found the post.
 *
 * The pacing rules here are the behavioural half of deliverability. Content
 * gets a mail into the inbox; behaviour keeps it there. A new sender that puts
 * out forty near-identical mails in ten minutes gets throttled by Gmail and
 * filtered by everyone receiving them, however well written each one is.
 */

import connectDB from "@/lib/db/connection";
import JobOutreach, { type IJobOutreach } from "@/lib/db/models/job-outreach";
import MasterResume from "@/lib/db/models/master-resume";
import User from "@/lib/db/models/user";
import CareerProfile from "@/lib/db/models/career-profile";
import Notification from "@/lib/db/models/notification";
import ActivityLog from "@/lib/db/models/activity-log";
import AgentGoal from "@/lib/db/models/agent-goal";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { buildPersonaSnapshot } from "@/lib/autopilot/persona";
import { getDefaultResume, resumeToText } from "@/lib/services/resume-service";
import { sanitizeForAI } from "@/lib/utils";
import { buildAIMetadata, saveAIUsageLog } from "@/lib/ai/usage-history";
import {
  buildApplicationEmailPrompt,
  finalizeBody,
  type ApplicationEmailResult,
} from "@/lib/ai/prompts/job-application-email";
import {
  sendApplicationEmail,
  explainSmtpError,
  isRetryableSmtpError,
} from "@/lib/email/gmail-smtp";
import { assessSpamRisk, canDeliverTo, SPAM_REWRITE_THRESHOLD } from "@/lib/email/deliverability";
import { pushSseEvent } from "@/lib/sse";
import { journal } from "@/lib/autopilot/journal";
import { getOutreachSettings, type OutreachSettings } from "./config";

/** Base for the exponential retry, and the ceiling it never passes. */
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_CAP_MS = 6 * 60 * 60 * 1000;

/**
 * Never write to the same address twice inside this window, even about a
 * different post. Two applications from a stranger in one month is the point
 * where a recruiter stops reading and starts reporting.
 */
const RECIPIENT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The daily cap is a rolling 24 hours rather than a calendar day.
 *
 * A calendar day lets the cap be spent twice across a midnight boundary — 20
 * mails at 23:50 and 20 more at 00:10 is 40 in twenty minutes, which is exactly
 * the burst the cap exists to prevent.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SendOutcome {
  ok: boolean;
  status: IJobOutreach["status"];
  reason?: string;
}

// ── Pacing ──────────────────────────────────────────────────────────────────

async function sentInLastDay(userId: string): Promise<number> {
  return JobOutreach.countDocuments({
    userId,
    status: "sent",
    sentAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
}

async function lastSentAt(userId: string): Promise<Date | null> {
  const last = await JobOutreach.findOne({ userId, status: "sent" })
    .sort({ sentAt: -1 })
    .select("sentAt")
    .lean();
  return last?.sentAt ?? null;
}

/** Whether this user may send right now, and if not, why. */
export async function checkPacing(
  userId: string,
  settings: OutreachSettings
): Promise<{ allowed: boolean; reason?: string }> {
  const sent = await sentInLastDay(userId);
  if (sent >= settings.dailyLimit) {
    return {
      allowed: false,
      reason: `Daily limit reached — ${sent} applications sent in the last 24 hours`,
    };
  }

  const last = await lastSentAt(userId);
  if (last) {
    const gapMs = settings.minGapMinutes * 60 * 1000;
    const waited = Date.now() - last.getTime();
    if (waited < gapMs) {
      const minutes = Math.ceil((gapMs - waited) / 60000);
      return { allowed: false, reason: `Spacing sends out — next one in ${minutes} min` };
    }
  }

  return { allowed: true };
}

// ── Drafting ────────────────────────────────────────────────────────────────

interface DraftContext {
  applicant: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    portfolio?: string;
    linkedin?: string;
    github?: string;
  };
  resumeText?: string;
  attachmentName?: string;
}

async function draftContext(userId: string, replyTo: string): Promise<DraftContext> {
  const [user, career, master, structured] = await Promise.all([
    User.findById(userId).select("name email linkedinProfile").lean(),
    CareerProfile.findOne({ userId }).lean(),
    MasterResume.findOne({ userId }).select("filename textPreview").lean(),
    getDefaultResume(userId),
  ]);

  // The attached file is the user's own PDF, which we do not parse. What the
  // prompt gets is the structured resume the rest of the app already holds —
  // the same facts, in a form the model can cite without misreading a layout.
  const resumeText =
    master?.textPreview || (structured ? resumeToText(structured) : undefined);

  return {
    applicant: {
      name: career?.contactInfo?.name || user?.name || "",
      // The address they will actually reply to, not whatever is on the profile.
      email: replyTo,
      phone: career?.contactInfo?.phone,
      location: career?.contactInfo?.location,
      portfolio: career?.contactInfo?.portfolio,
      linkedin: career?.contactInfo?.linkedin || user?.linkedinProfile?.url,
      github: career?.contactInfo?.github,
    },
    resumeText,
    attachmentName: master?.filename,
  };
}

/**
 * Write the covering note for one opening.
 *
 * The spam assessment is fed back into a single rewrite rather than a loop: if
 * a second, explicitly-corrected attempt still reads as bulk mail, the problem
 * is the post or the fit, and a third call is money spent on the same answer.
 */
export async function draftApplication(
  userId: string,
  record: IJobOutreach,
  settings: OutreachSettings
): Promise<
  | {
      ok: true;
      subject: string;
      body: string;
      fit: string;
      spamScore: number;
      spamIssues: string[];
      /** The file the draft was written against, or "" when none was on file. */
      attachmentName: string;
    }
  | { ok: false; reason: string; spamIssues?: string[]; skipped?: boolean }
> {
  const provider = await getUserAIProvider(userId);
  if (!provider) {
    return { ok: false, reason: "No AI provider configured — add an API key in Settings" };
  }

  const [context, goal] = await Promise.all([
    draftContext(userId, settings.gmailUser),
    AgentGoal.findOne({ userId }).select("personaSnapshot").lean(),
  ]);

  const persona = goal?.personaSnapshot || (await buildPersonaSnapshot(userId));
  if (!persona.signatureProjects?.length && !persona.summary) {
    return {
      ok: false,
      reason: "Your career profile is empty, so there is nothing real to write an application from",
    };
  }

  const messages = buildApplicationEmailPrompt({
    persona,
    applicant: context.applicant,
    resumeText: context.resumeText,
    signature: settings.signature,
    attachmentName: context.attachmentName,
    post: {
      authorName: sanitizeForAI(record.authorName || ""),
      authorHeadline: sanitizeForAI(record.authorHeadline || ""),
      content: sanitizeForAI(record.postContent || ""),
      company: record.company,
      roleTitle: record.roleTitle,
    },
  });

  const generate = async (extra?: string): Promise<ApplicationEmailResult> => {
    const result = await provider.generateJSON<ApplicationEmailResult>(
      extra ? [...messages, { role: "user", content: extra }] : messages,
      { temperature: 0.6, maxTokens: 900 }
    );
    await saveAIUsageLog({
      userId,
      isGuest: false,
      endpoint: "/api/outreach/send",
      metadata: buildAIMetadata(provider),
    });
    return result;
  };

  let draft: ApplicationEmailResult;
  try {
    draft = await generate();
  } catch (error) {
    return { ok: false, reason: `Could not write the email: ${(error as Error).message}` };
  }

  // Models decline a real opening in the user's own field whenever the post
  // lists a tool they have not used, however plainly the prompt says not to.
  // A refusal on any ground the prompt did not offer gets challenged exactly
  // once, with the refusal quoted back. This is the difference between a
  // feature that applies to most of the openings it finds and one that applies
  // to almost none.
  if (draft.shouldApply === false && !isAcceptedRefusal(draft.skipReason)) {
    try {
      const reconsidered = await generate(
        `You declined with: "${draft.skipReason}". That is a missing tool, a missing requirement or a judgement about strength of fit — none of which are grounds to skip, and all of which are the recruiter's call rather than yours. Skip ONLY if this is not a job posting at all, or if it is a genuinely different occupation such as nursing, accounting, driving, sales, law or teaching. If neither is true, set shouldApply to true and write the application, saying honestly what the applicant has actually built and in what, and never claiming the tool they have not used. Reply with the same JSON schema.`
      );
      if (reconsidered.shouldApply !== false) draft = reconsidered;
    } catch {
      // Keep the original refusal rather than failing the whole attempt.
    }
  }

  if (draft.shouldApply === false) {
    return {
      ok: false,
      skipped: true,
      reason: draft.skipReason || "Decided this was not a real opening to apply to",
    };
  }

  let subject = (draft.subject || "").replace(/\s+/g, " ").trim().slice(0, 180);
  let body = finalizeBody(draft.body || "", settings.signature);
  let assessment = assessSpamRisk({ subject, body, attachments: context.attachmentName ? 1 : 0 });

  if (assessment.score >= SPAM_REWRITE_THRESHOLD) {
    try {
      const retry = await generate(
        `That draft would be filtered as bulk mail. Specifically: ${assessment.issues.join("; ")}.\n\nRewrite it so none of those apply. Keep it plain, specific and short, and keep every factual claim identical to the last draft. Reply with the same JSON schema.`
      );
      if (retry.shouldApply !== false) {
        const retrySubject = (retry.subject || "").replace(/\s+/g, " ").trim().slice(0, 180);
        const retryBody = finalizeBody(retry.body || "", settings.signature);
        const retryAssessment = assessSpamRisk({
          subject: retrySubject,
          body: retryBody,
          attachments: context.attachmentName ? 1 : 0,
        });
        if (retryAssessment.score < assessment.score) {
          subject = retrySubject;
          body = retryBody;
          assessment = retryAssessment;
        }
      }
    } catch {
      // Keep the first draft and let the threshold below decide its fate.
    }
  }

  if (!subject || body.length < 120) {
    return { ok: false, reason: "The generated email came back empty or far too short" };
  }

  if (assessment.score >= SPAM_REWRITE_THRESHOLD) {
    return {
      ok: false,
      reason: `The draft still reads as bulk mail, so I did not send it: ${assessment.issues.join("; ")}`,
      spamIssues: assessment.issues,
    };
  }

  return {
    ok: true,
    subject,
    body,
    fit: (draft.fit || "").slice(0, 300),
    spamScore: assessment.score,
    spamIssues: assessment.issues,
    attachmentName: context.attachmentName || "",
  };
}

/**
 * Is this refusal one of the grounds the prompt actually allows?
 *
 * Written as a list of ACCEPTED refusals rather than a list of bad ones,
 * because the observed failure mode is over-refusal and it arrives in endless
 * different phrasings ("requires WordPress, which I do not have", "not a strong
 * enough match", "lacks the required years"). Anything that is not recognisably
 * "this is not a job" or "this is another profession" gets challenged once.
 * The challenge is a question, not an override — the model can and does hold
 * its ground on genuinely bad fits.
 */
export function isAcceptedRefusal(reason?: string): boolean {
  const text = (reason || "").toLowerCase();
  if (!text) return false;
  return /different (?:profession|field|occupation|industry|career|line of work)|not (?:a |really a |an actual )?job|isn'?t a job|no(?:t a)? (?:real )?(?:opening|vacancy)|course|bootcamp|webinar|advert|advertis|promotion|applications? (?:are )?closed|no longer accepting|looking for (?:work|a job)|job seeker|seeking work|networking post|unrelated (?:field|industry)|physical(?:ly)? (?:presence|on-?site)|work authorisation|work authorization|visa/.test(
    text
  );
}

// ── Sending ─────────────────────────────────────────────────────────────────

/** Park a record for a human, with the reason on it. */
async function park(
  record: IJobOutreach,
  status: IJobOutreach["status"],
  reason: string,
  spamIssues?: string[]
): Promise<SendOutcome> {
  record.status = status;
  record.lastError = reason.slice(0, 1000);
  record.nextAttemptAt = undefined;
  if (spamIssues) record.spamIssues = spamIssues;
  await record.save();
  return { ok: false, status, reason };
}

/** Schedule another attempt, or give up when the budget is spent. */
async function backoff(record: IJobOutreach, reason: string): Promise<SendOutcome> {
  record.attempts += 1;
  record.lastError = reason.slice(0, 1000);
  record.history.push({ at: new Date(), ok: false, error: reason.slice(0, 500) });

  if (record.attempts >= record.maxAttempts) {
    record.status = "failed";
    record.nextAttemptAt = undefined;
    await record.save();
    return { ok: false, status: "failed", reason };
  }

  record.status = "queued";
  record.nextAttemptAt = new Date(
    Date.now() + Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** record.attempts)
  );
  await record.save();
  return { ok: false, status: "queued", reason };
}

/**
 * Take one queued opening all the way: check, draft, send, record.
 *
 * The record arrives already claimed (status `sending`), so two worker passes
 * can never send the same application twice.
 */
export async function sendOneApplication(
  record: IJobOutreach,
  settings: OutreachSettings
): Promise<SendOutcome> {
  const userId = record.userId.toString();
  const recipient = (record.recipientEmail || "").toLowerCase();

  if (!recipient) {
    return park(record, "needs_manual", "No address on the post to write to");
  }

  // Has this address already had an application from us recently? Different
  // post, same company inbox — the recruiter cannot tell those apart.
  const recent = await JobOutreach.findOne({
    userId,
    recipientEmail: recipient,
    status: "sent",
    sentAt: { $gte: new Date(Date.now() - RECIPIENT_COOLDOWN_MS) },
    _id: { $ne: record._id },
  })
    .select("sentAt")
    .lean();
  if (recent) {
    return park(
      record,
      "skipped",
      `Already applied to ${recipient} on ${recent.sentAt?.toDateString()} — not writing again this soon`
    );
  }

  const deliverable = await canDeliverTo(recipient);
  if (!deliverable.ok) {
    return park(record, "failed", deliverable.reason || "Address is not deliverable");
  }

  const resume = await MasterResume.findOne({ userId }).lean();
  if (!resume) {
    return park(
      record,
      "needs_review",
      "Upload your master resume in Settings — an application without it is worth less than not sending one"
    );
  }

  // A draft already on the record (the user edited it, or a previous attempt
  // failed at the SMTP step) is reused rather than regenerated: the mail the
  // user approved is the mail that goes out, and it saves an AI call per retry.
  //
  // Except when the attachment has changed underneath it. A draft written
  // before a resume was uploaded says "available on request"; sending that with
  // a file attached reads as carelessness, which is the one impression a cold
  // application cannot afford.
  let subject = record.subject || "";
  let body = record.body || "";
  let fit = "";

  if (record.attachmentName && record.attachmentName !== resume.filename) {
    subject = "";
    body = "";
  }

  if (!subject || !body) {
    const draft = await draftApplication(userId, record, settings);
    if (!draft.ok) {
      if (draft.skipped) return park(record, "skipped", draft.reason);
      return park(record, "needs_review", draft.reason, draft.spamIssues);
    }
    subject = draft.subject;
    body = draft.body;
    fit = draft.fit;
    record.subject = subject;
    record.body = body;
    record.attachmentName = draft.attachmentName;
    record.spamScore = draft.spamScore;
    record.spamIssues = draft.spamIssues;
  }

  try {
    const result = await sendApplicationEmail({
      credentials: { user: settings.gmailUser, appPassword: settings.appPassword },
      fromName: settings.fromName,
      to: recipient,
      subject,
      body,
      bccSelf: settings.ccSelf,
      attachments: [
        {
          filename: resume.filename,
          content: Buffer.from(resume.data),
          contentType: resume.contentType,
        },
      ],
    });

    record.status = "sent";
    record.sentAt = new Date();
    record.messageId = result.messageId;
    record.attachmentName = resume.filename;
    record.lastError = undefined;
    record.nextAttemptAt = undefined;
    record.attempts += 1;
    record.history.push({ at: new Date(), ok: true });
    await record.save();

    const label =
      [record.roleTitle, record.company].filter(Boolean).join(" at ") ||
      record.authorName ||
      "a role";

    await Promise.all([
      ActivityLog.create({
        userId,
        action: "outreach_email_sent",
        module: "jobs",
        details: {
          outreachId: record._id.toString(),
          recipient,
          subject,
          company: record.company,
          roleTitle: record.roleTitle,
          messageId: result.messageId,
        },
        status: "success",
        linkedinUrl: record.postUrl || undefined,
      }),
      Notification.create({
        userId,
        type: "application_submitted",
        title: "Application sent",
        message: `Emailed ${recipient} about ${label}.`,
        module: "jobs",
        actionUrl: "/dashboard/outreach",
      }),
      journal({
        userId,
        entryType: "action",
        phase: "engagement",
        text: `Applied for ${label} by email to ${recipient}, with your resume attached.${fit ? ` Why I think it fits: ${fit}` : ""}\n\nSubject: ${subject}`,
        refs: { taskId: record.taskId },
      }),
    ]);

    pushSseEvent(userId, "outreach:sent", {
      id: record._id.toString(),
      recipientEmail: recipient,
      subject,
      company: record.company,
      roleTitle: record.roleTitle,
    });

    return { ok: true, status: "sent" };
  } catch (error) {
    const reason = explainSmtpError(error);

    if (!isRetryableSmtpError(error)) {
      await park(record, "failed", reason);
      await Notification.create({
        userId,
        type: "application_failed",
        title: "Application could not be sent",
        message: reason,
        module: "jobs",
        actionUrl: "/dashboard/outreach",
      });
      return { ok: false, status: "failed", reason };
    }

    return backoff(record, reason);
  }
}

/**
 * Claim and send the next due application for one user.
 *
 * Returns how many went out — 0 or 1. One per pass, deliberately: the interval
 * between passes is the spacing, and a loop here would defeat it.
 */
export async function processUserOutreach(userId: string): Promise<{
  sent: number;
  reason?: string;
}> {
  await connectDB();

  const settings = await getOutreachSettings(userId);
  if (!settings.enabled) return { sent: 0, reason: "Email outreach is off" };

  const pacing = await checkPacing(userId, settings);
  if (!pacing.allowed) return { sent: 0, reason: pacing.reason };

  // Atomic claim. Whichever process wins this update owns the send; anyone else
  // sees no due record and moves on.
  const claimed = await JobOutreach.findOneAndUpdate(
    {
      userId,
      status: "queued",
      channel: "email",
      recipientEmail: { $exists: true, $ne: "" },
      $or: [{ nextAttemptAt: { $lte: new Date() } }, { nextAttemptAt: { $exists: false } }],
    },
    { $set: { status: "sending" } },
    { sort: { createdAt: 1 }, new: true }
  );

  if (!claimed) return { sent: 0, reason: "Nothing due" };

  try {
    const outcome = await sendOneApplication(claimed, settings);
    return { sent: outcome.ok ? 1 : 0, reason: outcome.reason };
  } catch (error) {
    // An unexpected throw must never strand a record in `sending` forever.
    await backoff(claimed, (error as Error).message || "Unexpected send failure");
    return { sent: 0, reason: (error as Error).message };
  }
}

/**
 * One pass over every user with an application waiting.
 *
 * Driven from the worker in server.ts. Users are found from the queue itself
 * rather than from the settings collection, so a user with nothing to send
 * costs nothing to skip.
 */
export async function processDueOutreach(): Promise<{ users: number; sent: number }> {
  await connectDB();

  const userIds = await JobOutreach.distinct("userId", {
    status: "queued",
    channel: "email",
    $or: [{ nextAttemptAt: { $lte: new Date() } }, { nextAttemptAt: { $exists: false } }],
  });

  let sent = 0;
  for (const id of userIds) {
    try {
      const result = await processUserOutreach(id.toString());
      sent += result.sent;
    } catch (error) {
      console.error(`[Outreach] Send pass failed for user ${id}:`, error);
    }
  }

  return { users: userIds.length, sent };
}

/**
 * Free records stuck mid-send by a crash or a redeploy.
 *
 * `sending` is only ever held for the length of one SMTP conversation, so
 * anything still in it after this long is orphaned rather than in flight.
 */
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

export async function reclaimStuckOutreach(): Promise<number> {
  await connectDB();
  const result = await JobOutreach.updateMany(
    { status: "sending", updatedAt: { $lt: new Date(Date.now() - CLAIM_TIMEOUT_MS) } },
    { $set: { status: "queued", nextAttemptAt: new Date() } }
  );
  return result.modifiedCount || 0;
}
