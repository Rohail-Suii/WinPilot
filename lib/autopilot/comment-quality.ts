/**
 * The comment quality gate.
 *
 * The prompts ask for a comment with something to say; this is what happens
 * when the model ignores them. Kept out of the route so it can be tested
 * directly — it is the last thing standing between the user's account and a
 * feed full of "Great post!".
 */

/**
 * Praise openers that mean the model ignored the voice rules.
 *
 * Anchored to the start because the failure mode is a comment that leads with
 * flattery and then says something; catching it mid-sentence would reject
 * legitimate comments that quote the post.
 */
const PRAISE_OPENER =
  /^\W*(great|love|nice|amazing|excellent|fantastic|insightful|powerful)\b|^\W*(thanks for sharing|couldn'?t agree more|could not agree more|so true|well said|100%|absolutely|spot on|this resonates|this is gold|totally agree|fully agree|agreed\b|well put|very true|good point|great point)/i;

/**
 * Congratulation openers.
 *
 * Held separately from praise because on a promotion, a new job or a launch,
 * opening with congratulations is what a person does — it is only boilerplate
 * when that is the whole comment. Rejecting it outright is what left every
 * personal-news post liked but not commented on: the model wrote the natural
 * thing, the gate threw it away, and the post got a bare like instead.
 */
const CONGRATS_OPENER = /^\W*(congrats|congratulations|huge congrats|well deserved)/i;

/** Sycophancy that can appear anywhere and still ruins the comment. */
const SYCOPHANCY = /\b(great post|love this|thanks for sharing|well said|so true|couldn'?t agree more|great insight|this resonates|spot on)\b/i;

/**
 * Strip the tells the prompt bans but models emit anyway.
 *
 * Rejecting on these would throw away otherwise good comments, and there is no
 * retry loop to learn from a rejection — so formatting slips are fixed here and
 * only substantive failures (flattery, emptiness) are rejected.
 */
export function polishComment(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    // Em/en dashes read as machine-written in a LinkedIn comment.
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/#\w+/g, "")
    // Emoji and pictographs.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

export interface QualityOptions {
  minLength?: number;
  /**
   * Let the comment open with congratulations.
   *
   * Set for personal news — a promotion, a new role, a launch. The comment
   * still has to say something beyond the congratulation, which the length
   * floor enforces.
   */
  allowCongratulation?: boolean;
}

/** Why this comment is unpostable, or null if it is fine. */
export function rejectReason(
  comment: string,
  options: number | QualityOptions = {}
): string | null {
  // Callers used to pass a bare minimum length; keep that working.
  const { minLength = 15, allowCongratulation = false } =
    typeof options === "number" ? { minLength: options } : options;

  if (!comment || comment.length < minLength) return "came back empty or too short";

  if (PRAISE_OPENER.test(comment)) return "opened with flattery";

  if (CONGRATS_OPENER.test(comment)) {
    if (!allowCongratulation) return "opened with flattery";
    // "Congratulations!" and nothing else is still boilerplate. Anything past
    // the congratulation is the part that makes it worth posting.
    const rest = comment.replace(CONGRATS_OPENER, "").replace(/^\W+/, "").trim();
    if (rest.length < 25) return "was a bare congratulation with nothing behind it";
  }

  if (SYCOPHANCY.test(comment)) return "was generic praise";

  return null;
}

/**
 * Put the user's portfolio link on the end of a pitch.
 *
 * Appended here rather than asked for in the prompt, for three reasons: the
 * model cannot typo or hallucinate a URL it never writes, the taste rules can
 * go on banning links everywhere else, and `polishComment` has already run so
 * nothing downstream will reformat it.
 *
 * Only ever called for a pitch on a hiring post. Everywhere else a link in a
 * LinkedIn comment reads as spam and gets the comment down-ranked.
 */
export function appendPortfolio(comment: string, url: string): string {
  const link = (url || "").trim();
  if (!comment.trim() || !link) return comment;

  // The model sometimes closes with the link of its own accord despite being
  // told not to. Two copies is worse than none.
  if (comment.includes(link)) return comment;
  const bareHost = link.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (bareHost && comment.includes(bareHost)) return comment;

  const body = comment.replace(/\s+$/, "");
  const punctuated = /[.!?]$/.test(body) ? body : `${body}.`;
  return `${punctuated} ${link}`;
}
