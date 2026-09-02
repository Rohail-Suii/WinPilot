/**
 * Writing the actual application email.
 *
 * The resume is the user's own file and goes out untouched — this prompt writes
 * only the covering note. That constraint shapes everything: the body's job is
 * to give a recruiter a reason to open the attachment, in the fifteen seconds
 * they will spend on it, using nothing but facts that are already in the user's
 * profile.
 *
 * The second constraint is deliverability. Gmail's own reputation carries the
 * message past authentication, but a body that reads like a mail merge still
 * lands in Promotions or Spam. So: plain text, no emoji, no marketing verbs, at
 * most one link, and details specific to this post that no bulk sender could
 * have written.
 */

import type { AIMessage } from "@/lib/ai/provider";
import type { IPersonaSnapshot } from "@/lib/db/models/agent-goal";
import { personaBlock } from "./autopilot";

export interface ApplicationEmailResult {
  /** Is anyone offering paid work here at all? */
  isJobPosting?: boolean;
  /**
   * A genuinely different occupation — judged on the profession, not the tool
   * list. Phrased negatively on purpose: a model asked "is this the same field"
   * quietly answers "does this person meet every requirement" instead, and
   * talks itself out of every role whose stack is not an exact match.
   */
  differentProfession?: boolean;
  /**
   * The two above, ANDed. Asked for separately because a model left to judge
   * "should I apply" in one step talks itself out of every role whose tool list
   * is not an exact match — which is nearly all of them.
   */
  shouldApply: boolean;
  skipReason?: string;
  subject: string;
  /** Plain text. No markdown, no HTML — the transport builds the HTML part. */
  body: string;
  /** One line of self-justification, shown in the dashboard next to the draft. */
  fit: string;
}

export interface ApplicationEmailContext {
  persona: IPersonaSnapshot;
  applicant: {
    name: string;
    email: string;
    phone?: string;
    location?: string;
    portfolio?: string;
    linkedin?: string;
    github?: string;
  };
  /** Text pulled from the master resume, when it could be extracted. */
  resumeText?: string;
  /** Verbatim block appended below the sign-off. Empty when unset. */
  signature?: string;
  post: {
    authorName: string;
    authorHeadline: string;
    content: string;
    company?: string;
    roleTitle?: string;
  };
  /** The file the recruiter will receive, named so the body can refer to it. */
  attachmentName?: string;
}

const DELIVERABILITY_RULES = `HOW IT MUST BE WRITTEN — these are not style preferences, they decide whether it reaches the inbox:
- Plain text only. No markdown, no bold, no bullet characters other than a plain "-", no HTML.
- No emoji anywhere, subject included.
- At most ONE link in the whole email, and only if it is the portfolio or GitHub listed above. Never a shortened link.
- Never write "Dear Sir/Madam", "Dear Hiring Manager/Recruiter", "To whom it may concern", "I hope this email finds you well", "I am writing to express my interest", or "kindly do the needful".
- No words in ALL CAPS. No exclamation marks. No "urgent", "act now", "limited", "guaranteed", "free".
- Do not mention automation, bots, scraping, or that this was generated. Do not say where you saw the post beyond "your LinkedIn post".
- Do not include an unsubscribe line, a footer, a disclaimer, or a tracking parameter of any kind.`;

const CONTENT_RULES = `WHAT IT MUST SAY:
- 110 to 190 words in the body. Shorter reads as spam, longer does not get read.
- Open by naming the exact role from the post and the fact that you saw their post. One sentence.
- Then two to four sentences of evidence, drawn ONLY from the background above, that match what the post actually asked for. Name the specific project or system and what it did, not adjectives about yourself.
- If the post lists a hard requirement you genuinely have, address it directly and concretely.
- If the post asks for something specific (a portfolio, an expected rate, an availability date, a reference number in the subject), do exactly what it asks.
- One closing sentence about the attached resume and availability.
- Sign off with the applicant's name.
- Never claim a technology, employer, client, degree, certification, or years of experience that is not in the background above. If the post's core requirement is missing from the background, say plainly that the closest real experience is X — do not invent it.

THE SUBJECT LINE:
- The form recruiters filter on: the role, then the applicant's name. For example "Website Developer — Rohail Ahmed".
- If the post asks for a particular subject line or reference code, use theirs exactly instead.
- Under 70 characters. No "Re:", no "Fwd:", no emoji, no exclamation marks.`;

/** Trim a scraped post to the part that carries the requirements. */
function clip(text: string, max: number): string {
  const value = (text || "").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function buildApplicationEmailPrompt(ctx: ApplicationEmailContext): AIMessage[] {
  const { applicant, post } = ctx;

  const contactLines = [
    `Name: ${applicant.name}`,
    `Email: ${applicant.email}`,
    applicant.phone ? `Phone: ${applicant.phone}` : "",
    applicant.location ? `Location: ${applicant.location}` : "",
    applicant.portfolio ? `Portfolio: ${applicant.portfolio}` : "",
    applicant.github ? `GitHub: ${applicant.github}` : "",
    applicant.linkedin ? `LinkedIn: ${applicant.linkedin}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      role: "system",
      content: `You write job application emails AS the person below, to a recruiter who posted an opening on LinkedIn. One email, to one person, about one role.

WHO YOU ARE — the only experience you may reference
${personaBlock(ctx.persona)}

CONTACT DETAILS
${contactLines}
${ctx.resumeText ? `\nRESUME (the attached file, for detail you may cite — never contradict it)\n${clip(ctx.resumeText, 4000)}` : ""}
${ctx.attachmentName ? `\nATTACHED FILE: ${ctx.attachmentName} — refer to it as an attached resume, nothing fancier.` : "\nNO FILE IS ATTACHED. Do not claim there is one."}

${CONTENT_RULES}

${DELIVERABILITY_RULES}

BEFORE WRITING, answer these two questions literally. They are the ONLY grounds for not applying. Do not substitute a question of your own, and in particular do not ask yourself whether the applicant meets every requirement — that question is the recruiter's, not yours.

1. isJobPosting — is someone offering paid work here? False for a person announcing their own job search, an advert, a course, a newsletter, a general networking post, or a post saying applications have closed.
2. differentProfession — would applying mean claiming a career the applicant does not have? True only for a genuinely different occupation: nursing, accounting, driving, sales, teaching, law, logistics. If the post is software, web, mobile, data or IT work and the background above is software, web, mobile, data or IT work, this is FALSE. WordPress, PHP, Laravel, Rails, Django, React, Next.js, WooCommerce, Shopify and Webflow are all the same profession as each other.

shouldApply = isJobPosting AND NOT differentProfession. Nothing else enters into it.

Missing a specific framework, CMS, language, tool or number of years is NEVER grounds to skip, and does not make differentProfession true. A full-stack JavaScript engineer applying for a WordPress website developer role is a normal, honest application: shouldApply is true, and the email says what they have actually built and in what, without claiming WordPress. Deciding on the recruiter's behalf that the applicant is unqualified is not your job; being honest in the email is. Skipping a real opening in the applicant's own field is the worst outcome available to you.

Respond with valid JSON only. Schema:
{
  "isJobPosting": true | false,
  "differentProfession": true | false,
  "shouldApply": true | false,
  "skipReason": "one line, only when shouldApply is false",
  "subject": "the subject line",
  "body": "the full plain-text email body, including the greeting and sign-off, with real line breaks",
  "fit": "one line on why this person fits this role"
}`,
    },
    {
      role: "user",
      content: `THE POST
Posted by: ${post.authorName || "someone"}${post.authorHeadline ? ` (${post.authorHeadline})` : ""}
${post.company ? `Company: ${post.company}\n` : ""}${post.roleTitle ? `Role as best I can tell: ${post.roleTitle}\n` : ""}
"""
${clip(post.content, 3000)}
"""

Write the application.`,
    },
  ];
}

/**
 * Put the body into its final shape.
 *
 * The model is told to write plain text and mostly does, but it reaches for
 * markdown emphasis and a leading "Subject:" line often enough that stripping
 * them here is cheaper than another generation. The signature is appended
 * rather than generated so it is always exactly what the user configured.
 */
export function finalizeBody(body: string, signature?: string): string {
  let text = (body || "")
    .replace(/\r\n/g, "\n")
    // A model that repeats the subject inside the body sends it twice.
    .replace(/^\s*subject\s*:.*\n+/i, "")
    // Markdown emphasis renders as literal asterisks in a plain-text part.
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\S)[*_](\S(?:.*?\S)?)[*_](?!\S)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const trimmedSignature = (signature || "").trim();
  if (trimmedSignature && !text.includes(trimmedSignature)) {
    text = `${text}\n\n${trimmedSignature}`;
  }

  return text;
}
