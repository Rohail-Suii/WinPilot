/**
 * The comment quality gate.
 *
 * The prompts ask for a comment with something to say; this is what happens
 * when the model ignores them. Kept out of the route so it can be tested
 * directly — it is the last thing standing between the user's account and a
 * feed full of "Great post!".
 */

/**
 * Openers and phrases that mean the model ignored the voice rules.
 *
 * Anchored to the start because the failure mode is a comment that leads with
 * flattery and then says something; catching it mid-sentence would reject
 * legitimate comments that quote the post.
 */
const BOILERPLATE_OPENER =
  /^\W*(great|love|nice|amazing|excellent|fantastic|insightful|powerful)\b|^\W*(thanks for sharing|couldn'?t agree more|could not agree more|so true|well said|100%|absolutely|spot on|this resonates|this is gold|totally agree|fully agree|agreed\b|congrats|congratulations|well put|very true|good point|great point)/i;

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

/** Why this comment is unpostable, or null if it is fine. */
export function rejectReason(comment: string, minLength = 15): string | null {
  if (!comment || comment.length < minLength) return "came back empty or too short";
  if (BOILERPLATE_OPENER.test(comment)) return "opened with flattery";
  if (SYCOPHANCY.test(comment)) return "was generic praise";
  return null;
}
