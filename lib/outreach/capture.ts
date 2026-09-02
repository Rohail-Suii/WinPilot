/**
 * Turning a feed post into a tracked opening.
 *
 * Called from the autopilot's generate endpoint while the extension is standing
 * on the post, so it has to be cheap: no AI, no SMTP, one indexed upsert. The
 * decision it makes is only "what route is there to apply, and is it good
 * enough to send unattended" — the writing and sending happen later, off the
 * critical path of the feed sweep.
 *
 * Two outcomes, and both of them are recorded:
 *   an address on the post  → queued for the sender
 *   no address              → saved with its link for the user to apply by hand
 *
 * A post with neither is still saved when it clearly reads as an opening. The
 * user asked for the link either way, and a link back to the post is always
 * something they can act on.
 */

import connectDB from "@/lib/db/connection";
import JobOutreach, { type IJobOutreach } from "@/lib/db/models/job-outreach";
import User from "@/lib/db/models/user";
import CareerProfile from "@/lib/db/models/career-profile";
import Notification from "@/lib/db/models/notification";
import { pushSseEvent } from "@/lib/sse";
import { journal } from "@/lib/autopilot/journal";
import { detectHiringPost, type PostLink } from "./hiring-post";
import { assessRelevance } from "./relevance";
import { loadRelevanceProfile } from "./relevance-profile";
import { getOutreachSettings } from "./config";

export interface CaptureInput {
  userId: string;
  taskId?: string;
  post: {
    postKey: string;
    postUrl?: string;
    postContent: string;
    authorName?: string;
    authorHeadline?: string;
    /** Anchors scraped off the post — mailto: and outbound links. */
    postLinks?: PostLink[];
  };
  /** The feed comment generator's classification, when one was produced. */
  aiPostType?: string;
}

export interface CaptureOutcome {
  captured: boolean;
  /** Set when a record exists — new or already there. */
  outreachId?: string;
  status?: IJobOutreach["status"];
  channel?: IJobOutreach["channel"];
  reason?: string;
}

/** Addresses that belong to the user — writing to yourself is not an application. */
async function ownAddresses(userId: string): Promise<string[]> {
  const [user, career] = await Promise.all([
    User.findById(userId).select("email").lean(),
    CareerProfile.findOne({ userId }).select("contactInfo.email").lean(),
  ]);
  return [user?.email, career?.contactInfo?.email]
    .filter((e): e is string => Boolean(e))
    .map((e) => e.toLowerCase());
}

/**
 * Look at one post and, if it is an opening, record it.
 *
 * Idempotent by `(userId, postKey)`: the feed shows the same card across sweeps
 * and the unique index is what stops a second email going to the same company
 * three hours later. A duplicate is a no-op, not an error.
 */
export async function captureHiringPost(input: CaptureInput): Promise<CaptureOutcome> {
  const { userId, post } = input;
  const postKey = (post.postKey || post.postUrl || "").trim();
  if (!postKey || !post.postContent) {
    return { captured: false, reason: "Nothing identifiable to record" };
  }

  // Detection is pure and runs first precisely so that the overwhelming
  // majority of feed posts — which are not job openings — cost no database
  // work at all. This function is called for every post the agent reads.
  const detection = detectHiringPost({
    content: post.postContent,
    links: post.postLinks || [],
    authorName: post.authorName,
    aiPostType: input.aiPostType,
  });

  if (!detection.isHiring) {
    return { captured: false, reason: "Does not read as a hiring post" };
  }

  await connectDB();

  const existing = await JobOutreach.findOne({ userId, postKey })
    .select("_id status channel")
    .lean();
  if (existing) {
    return {
      captured: false,
      outreachId: existing._id.toString(),
      status: existing.status,
      channel: existing.channel,
      reason: "Already recorded",
    };
  }

  const [settings, own, profile] = await Promise.all([
    getOutreachSettings(userId),
    ownAddresses(userId),
    loadRelevanceProfile(userId),
  ]);

  // Is this job anything to do with this person? Decided in code, from their
  // real history, before a single token is spent writing to anyone. An opening
  // in someone else's profession is recorded and closed rather than dropped, so
  // the decision is auditable and reversible from the dashboard.
  const relevance = assessRelevance(
    { roleTitle: detection.roleTitle, postContent: post.postContent },
    profile,
    { strictSkillMatch: settings.strictSkillMatch }
  );

  // The user's own address turns up on their own reposts and in signatures.
  // Filtered here rather than in the detector so the detector stays pure.
  const emails = detection.emails.filter((e) => !own.includes(e));
  const recipient = emails[0];
  const channel: IJobOutreach["channel"] = recipient
    ? "email"
    : detection.applyLinks.length > 0
      ? "link"
      : "none";

  let status: IJobOutreach["status"];
  if (!relevance.related) {
    // A confident "that is not your profession" is closed out. An unconfident
    // one — a post that names no role and no tools — is a question, and goes to
    // the user rather than being thrown away on a guess.
    status = relevance.certain ? "skipped" : "needs_review";
  } else if (!recipient) {
    // No address: this is the "save it for me" half of the feature. It is a
    // finished state, not a failure — there is nothing more the agent can do.
    status = "needs_manual";
  } else if (!settings.enabled) {
    // An address, but sending is off or unconfigured. Holding it as queued
    // would be a lie about what happens next.
    status = "needs_review";
  } else if (detection.confidence < settings.minConfidence) {
    status = "needs_review";
  } else {
    status = "queued";
  }

  let record: IJobOutreach;
  try {
    record = await JobOutreach.create({
      userId,
      source: "feed",
      taskId: input.taskId,
      postKey,
      postUrl: post.postUrl || "",
      postContent: post.postContent.slice(0, 6000),
      authorName: post.authorName || "",
      authorHeadline: post.authorHeadline || "",
      company: detection.company,
      roleTitle: detection.roleTitle,
      confidence: detection.confidence,
      signals: detection.signals,
      relevanceScore: relevance.score,
      matchedSkills: relevance.matchedSkills.slice(0, 12),
      channel,
      recipientEmail: recipient,
      candidateEmails: emails.slice(0, 5),
      applyLinks: detection.applyLinks,
      status,
      // The reason is on the record whichever way it went, so "why did it not
      // apply to that one" is answerable without re-reading the post.
      lastError: relevance.related
        ? undefined
        : relevance.certain
          ? `Not your line of work: ${relevance.reason}`
          : `Held for you: ${relevance.reason}`,
      // Due immediately; the sender's own pacing decides when it actually goes.
      nextAttemptAt: status === "queued" ? new Date() : undefined,
    });
  } catch (error) {
    // The unique index doing its job: another sweep captured this post between
    // the read above and this write.
    if ((error as { code?: number }).code === 11000) {
      return { captured: false, reason: "Already recorded" };
    }
    throw error;
  }

  const label = [detection.roleTitle, detection.company].filter(Boolean).join(" at ") ||
    post.authorName ||
    "a role";

  await journal({
    userId,
    entryType: "observation",
    phase: "engagement",
    text:
      status === "skipped"
        ? `That post was an opening — ${label} — but ${relevance.reason}. I left it alone.`
        : !relevance.related
          ? `That post looked like an opening — ${label} — but ${relevance.reason}. I have left it for you to judge rather than guess.`
          : status === "queued"
        ? `That post was an opening — ${label}. It gives an address (${recipient}), so I have queued an application with your resume attached.`
        : status === "needs_manual"
          ? `That post was an opening — ${label} — but there is no email address on it${detection.applyLinks.length ? `, only a link to apply through` : ""}. I have saved it for you to handle by hand.`
          : `That post was an opening — ${label}${recipient ? ` with an address (${recipient})` : ""} — but I am holding it for you to look at rather than sending unattended.`,
    refs: { taskId: input.taskId },
  });

  // Only tell the user about openings that are actually theirs. A notification
  // for every job on the feed the agent decided against is noise.
  if (status !== "skipped") {
    await Notification.create({
      userId,
      type: "lead_found",
      title: status === "queued" ? "Application queued" : "Hiring post saved",
      message:
        status === "queued"
          ? `Found ${label} and queued an application to ${recipient}.`
          : `Found ${label}. ${recipient ? "It needs your review before I send." : "No email address on the post — saved the link for you."}`,
      module: "jobs",
      actionUrl: "/dashboard/outreach",
    });
  }

  pushSseEvent(userId, "outreach:captured", {
    id: record._id.toString(),
    status,
    channel,
    company: detection.company,
    roleTitle: detection.roleTitle,
    recipientEmail: recipient,
    related: relevance.related,
  });

  return {
    captured: true,
    outreachId: record._id.toString(),
    status,
    channel,
  };
}
