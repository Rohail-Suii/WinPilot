/**
 * Keeping a cold job application out of the spam folder.
 *
 * Almost all of deliverability is decided before a word is written: the mail
 * goes out over authenticated Gmail SMTP, so SPF, DKIM and DMARC all pass and
 * the sending reputation is Google's, not a fresh domain's. What is left is
 * content and behaviour — and those are what this file guards.
 *
 * Two jobs:
 *   1. `assessSpamRisk` reads a drafted subject/body the way a filter does and
 *      names what would hurt it. A high score is a reason to rewrite, not a
 *      reason to guess.
 *   2. `hasMxRecord` checks the recipient's domain can receive mail at all.
 *      Bounces are the fastest way to burn a sender's reputation, and a typo'd
 *      domain scraped off a post is the likeliest bounce there is.
 */

import { resolveMx } from "dns/promises";

export interface SpamAssessment {
  /** 0 (clean) upward. Anything at or above `SPAM_REWRITE_THRESHOLD` is refused. */
  score: number;
  /** Human-readable, surfaced in the dashboard next to the draft. */
  issues: string[];
}

/** At or above this the draft is rejected rather than sent. */
export const SPAM_REWRITE_THRESHOLD = 4;

/**
 * Words filters have been trained on for two decades.
 *
 * Deliberately narrow: these are the phrases of bulk marketing, not of a person
 * applying for a job. "Opportunity" and "apply" are absent on purpose — they
 * belong in this mail and flagging them would make the check useless.
 */
const SPAM_PHRASES: [RegExp, number, string][] = [
  [/\b(?:100%|totally|completely)\s+(?:free|guaranteed)\b/i, 2, "sounds like an ad"],
  [/\bfree\s+(?:trial|offer|gift|money|access)\b/i, 2, "offers something free"],
  [/\b(?:act now|limited time|don'?t miss|hurry|urgent(?:ly)?\s+reply|last chance)\b/i, 2, "manufactured urgency"],
  [/\b(?:click here|click below|buy now|order now|subscribe now)\b/i, 2, "call-to-action phrasing from bulk mail"],
  [/\b(?:guaranteed?|risk[- ]free|no obligation|no strings)\b/i, 1, "promises a guarantee"],
  [/\b(?:earn|make)\s+\$?\d+\s*(?:per|a|\/)\s*(?:day|week|month|hour)\b/i, 3, "income claim"],
  [/\$\s?\d{3,}/, 1, "large money figure"],
  [/\b(?:winner|congratulations you|you have been selected|prize)\b/i, 3, "prize language"],
  [/\b(?:viagra|casino|crypto\s+investment|forex|loan approval)\b/i, 4, "classic spam vocabulary"],
  [/\bunsubscribe\b/i, 2, "unsubscribe wording makes a 1:1 mail look like a campaign"],
  [/\bthis (?:is not|isn'?t) spam\b/i, 3, "protesting that it is not spam"],
  [/\bdear (?:sir\/?madam|sir or madam|hiring manager\/recruiter)\b/i, 1, "generic salutation"],
];

const URL_RE = /https?:\/\/\S+/gi;

/** Count of words that are ALL CAPS and longer than two letters. */
function shoutedWords(text: string): string[] {
  return (text.match(/\b[A-Z]{3,}\b/g) || []).filter(
    // Acronyms a real application contains.
    (w) => !["CV", "SQL", "API", "AWS", "GCP", "CSS", "PHP", "SEO", "UI", "UX", "CI", "CD", "HTML", "REST", "SaaS", "LLM", "RAG"].includes(w)
  );
}

function emojiCount(text: string): number {
  return (text.match(/\p{Extended_Pictographic}/gu) || []).length;
}

/**
 * Read a drafted email the way a filter would.
 *
 * The checks that matter most for this specific mail are the structural ones —
 * link count, shouting, length — because the model rarely writes overt spam but
 * will happily pad a message with three links and a row of emoji.
 */
export function assessSpamRisk(input: {
  subject: string;
  body: string;
  /** Attachment count. Several attachments on a cold mail is itself a signal. */
  attachments?: number;
}): SpamAssessment {
  const subject = (input.subject || "").trim();
  const body = (input.body || "").trim();
  const issues: string[] = [];
  let score = 0;

  const add = (points: number, issue: string) => {
    score += points;
    issues.push(issue);
  };

  const combined = `${subject}\n${body}`;
  for (const [pattern, weight, label] of SPAM_PHRASES) {
    if (pattern.test(combined)) add(weight, label);
  }

  if (!subject) add(3, "no subject line");
  else if (subject.length > 90) add(1, "subject is too long to read in a list");
  else if (subject.length < 10) add(1, "subject is too thin to say what this is");

  if (/^(?:re|fwd):/i.test(subject)) add(3, "fake Re:/Fwd: prefix");
  if (shoutedWords(subject).length > 0) add(2, "subject shouts in capitals");
  if (/[!?]{2,}/.test(combined)) add(2, "repeated exclamation or question marks");
  if ((subject.match(/!/g) || []).length > 1) add(1, "more than one exclamation mark in the subject");

  const shouted = shoutedWords(body);
  if (shouted.length > 3) add(2, `${shouted.length} words are in all caps`);

  const emoji = emojiCount(combined);
  if (emoji > 2) add(2, `${emoji} emoji — a job application reads better without them`);
  else if (emoji > 0) add(1, "emoji in a cold application");

  const links = body.match(URL_RE) || [];
  if (links.length > 3) add(2, `${links.length} links — cold mail with many links gets filtered`);
  else if (links.length === 3) add(1, "three links is on the edge of what filters tolerate");

  // Shorteners hide their destination, which is exactly why filters distrust them.
  if (/\b(?:bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|lnkd\.in|shorturl\.at)\//i.test(body)) {
    add(2, "shortened link — filters cannot see where it goes");
  }

  const words = body.split(/\s+/).filter(Boolean).length;
  if (words < 40) add(2, "body is too short to read as a real application");
  else if (words > 400) add(1, "body is long enough that most recruiters will not read it");

  if ((input.attachments ?? 0) > 1) add(1, "more than one attachment on a first contact");

  if (/<(?:img|table|font)\b/i.test(body)) add(2, "marketing-style HTML markup");

  return { score, issues };
}

// ── Recipient checks ────────────────────────────────────────────────────────

const MX_CACHE = new Map<string, { ok: boolean; at: number }>();
const MX_TTL_MS = 24 * 60 * 60 * 1000;
const MX_TIMEOUT_MS = 5000;

/**
 * Can this domain receive mail?
 *
 * A miss is cached as well as a hit: a domain that does not resolve now will
 * not resolve on the retry three minutes later either, and every lookup is
 * latency inside a send loop.
 *
 * DNS being unreachable is NOT treated as a failed domain — that would stop
 * every send on a network blip. It returns `true` and lets the SMTP attempt be
 * the judge.
 */
export async function hasMxRecord(domain: string): Promise<boolean> {
  const host = (domain || "").trim().toLowerCase();
  if (!host || !host.includes(".")) return false;

  const cached = MX_CACHE.get(host);
  if (cached && Date.now() - cached.at < MX_TTL_MS) return cached.ok;

  try {
    const records = await Promise.race([
      resolveMx(host),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MX lookup timed out")), MX_TIMEOUT_MS)
      ),
    ]);
    const ok = Array.isArray(records) && records.length > 0;
    MX_CACHE.set(host, { ok, at: Date.now() });
    return ok;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // NXDOMAIN / no MX record: the domain genuinely cannot take mail.
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") {
      MX_CACHE.set(host, { ok: false, at: Date.now() });
      return false;
    }
    // Timeout, SERVFAIL, no network — unknown, not disproven.
    return true;
  }
}

/** Syntactic check, stricter than the scraper's so a bad capture stops here. */
export function isValidEmail(email: string): boolean {
  const value = (email || "").trim();
  if (value.length < 6 || value.length > 254) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/.test(value);
}

/** The recipient is reachable and worth spending a send on. */
export async function canDeliverTo(email: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isValidEmail(email)) return { ok: false, reason: "Not a valid email address" };
  const domain = email.split("@")[1];
  if (!(await hasMxRecord(domain))) {
    return { ok: false, reason: `${domain} has no mail server — this would bounce` };
  }
  return { ok: true };
}
