import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * One hiring post the agent found, and what happened about it.
 *
 * This is both halves of the feature in a single collection, because they are
 * the same thing at different stages: a post with an address becomes an email,
 * a post without one becomes a saved link for the user to open by hand. Keeping
 * them together means the dashboard has one timeline of "openings I found"
 * rather than two lists that have to be reconciled.
 *
 * `postKey` is the dedupe identity, exactly as it is for feed engagement — the
 * redesigned feed gives most cards no permalink, so the content fingerprint the
 * extension computes is what survives a re-scrape.
 */

export type OutreachStatus =
  /** Has an address, waiting for the sender. */
  | "queued"
  /** Being sent right now. Claimed by exactly one worker pass. */
  | "sending"
  /** Delivered to Gmail's SMTP server. */
  | "sent"
  /** Send failed and the retries are exhausted. */
  | "failed"
  /** No address on the post — the link is saved for the user to apply by hand. */
  | "needs_manual"
  /** Held back for a person to look at: low confidence, or a risky draft. */
  | "needs_review"
  /** The user dismissed it, or it was never really an opening. */
  | "skipped";

export type OutreachChannel = "email" | "link" | "none";

export interface IOutreachAttempt {
  at: Date;
  ok: boolean;
  error?: string;
}

export interface IJobOutreach extends Document {
  userId: mongoose.Types.ObjectId;

  // ── Where it came from ──
  source: "feed" | "manual";
  postKey: string;
  postUrl: string;
  postContent: string;
  authorName?: string;
  authorHeadline?: string;
  taskId?: string;

  // ── What it is ──
  company?: string;
  roleTitle?: string;
  confidence: number;
  signals: string[];
  /** How much of what the post asks for this person can actually answer. */
  relevanceScore: number;
  /** Their own skills that the post names — the evidence behind that score. */
  matchedSkills: string[];

  // ── How to answer it ──
  channel: OutreachChannel;
  recipientEmail?: string;
  /** Every address found, so the user can re-target a failed send. */
  candidateEmails: string[];
  applyLinks: string[];

  // ── The mail ──
  status: OutreachStatus;
  subject?: string;
  body?: string;
  attachmentName?: string;
  spamScore?: number;
  spamIssues: string[];
  messageId?: string;
  sentAt?: Date;

  // ── Delivery bookkeeping ──
  attempts: number;
  maxAttempts: number;
  nextAttemptAt?: Date;
  lastError?: string;
  history: IOutreachAttempt[];

  /** Set when the user says they followed up on a manual one. */
  handledAt?: Date;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const JobOutreachSchema = new Schema<IJobOutreach>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    source: { type: String, enum: ["feed", "manual"], default: "feed" },
    postKey: { type: String, required: true },
    postUrl: { type: String, default: "" },
    // Enough of the post to write the email from and to show in the dashboard.
    postContent: { type: String, default: "", maxlength: 6000 },
    authorName: { type: String, default: "" },
    authorHeadline: { type: String, default: "" },
    taskId: { type: String },

    company: { type: String, default: "" },
    roleTitle: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    signals: { type: [String], default: [] },
    relevanceScore: { type: Number, default: 0 },
    matchedSkills: { type: [String], default: [] },

    channel: { type: String, enum: ["email", "link", "none"], default: "none" },
    recipientEmail: { type: String, lowercase: true, trim: true },
    candidateEmails: { type: [String], default: [] },
    applyLinks: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["queued", "sending", "sent", "failed", "needs_manual", "needs_review", "skipped"],
      default: "needs_manual",
      index: true,
    },
    subject: { type: String, maxlength: 300 },
    body: { type: String, maxlength: 8000 },
    attachmentName: { type: String },
    spamScore: { type: Number },
    spamIssues: { type: [String], default: [] },
    messageId: { type: String },
    sentAt: { type: Date },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 4 },
    nextAttemptAt: { type: Date },
    lastError: { type: String, maxlength: 1000 },
    history: {
      type: [
        {
          at: { type: Date, default: Date.now },
          ok: { type: Boolean, default: false },
          error: { type: String, maxlength: 500 },
        },
      ],
      default: [],
    },

    handledAt: { type: Date },
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true }
);

/**
 * One record per post per user.
 *
 * The feed shows the same post repeatedly across sweeps and sessions, so
 * without this the agent would re-detect and re-email the same opening every
 * time it came round. Unique rather than merely indexed because the capture
 * path relies on the write failing.
 */
JobOutreachSchema.index({ userId: 1, postKey: 1 }, { unique: true });
JobOutreachSchema.index({ userId: 1, status: 1, createdAt: -1 });
/** The sender's work queue: due items, oldest first. */
JobOutreachSchema.index({ status: 1, nextAttemptAt: 1 });
/** "Have I already written to this address?" — asked before every send. */
JobOutreachSchema.index({ userId: 1, recipientEmail: 1, sentAt: -1 });

/** Statuses the sender still has work to do on. */
export const PENDING_OUTREACH_STATUSES: OutreachStatus[] = ["queued", "sending"];

const JobOutreach: Model<IJobOutreach> =
  mongoose.models.JobOutreach ||
  mongoose.model<IJobOutreach>("JobOutreach", JobOutreachSchema);

export default JobOutreach;
