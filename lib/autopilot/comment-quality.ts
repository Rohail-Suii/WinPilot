/**
 * The comment quality gate.
 *
 * The prompts ask for a comment with something to say; this is what happens
 * when the model ignores them. Kept out of the route so it can be tested
 * directly — it is the last thing standing between the user's account and a
 * feed full of "Great post!".
 */

/**
 * The tone a comment is written in, independent of what the post is about.
 *
 * Topic and mood are two axes, not one: a joke about Kubernetes is a technical
 * post written to be funny. Every comment used to be answered in the analytical
 * key regardless, which is what made a run of them read as machine-written.
 */
export type CommentRegister = "analytical" | "playful" | "celebratory" | "supportive";

/** How long a comment is aiming to be. Drawn per post, not per register. */
export type LengthBand = "reaction" | "short" | "standard";

export const COMMENT_REGISTERS: CommentRegister[] = [
  "analytical",
  "playful",
  "celebratory",
  "supportive",
];

/**
 * Warmth. "Great...", "Love...", "Amazing..." — what a real person writes when
 * they mean it, and the natural opener on something funny or celebratory.
 *
 * Anchored to the start because the failure mode is a comment that leads with
 * flattery and then says something; catching it mid-sentence would reject
 * legitimate comments that quote the post.
 */
const PRAISE_ADJECTIVE_OPENER =
  /^\W*(great|love|nice|amazing|excellent|fantastic|insightful|powerful)\b/i;

/**
 * Empty agreement. Never a comment, on any post, in any register.
 *
 * Held apart from the adjectives above because relaxing flattery on a light
 * post means allowing warmth, not allowing the canonical LinkedIn-bot phrases.
 * Nobody writes "so true" under a friend's joke and sounds human.
 */
const PRAISE_PHRASE_OPENER =
  /^\W*(thanks for sharing|couldn'?t agree more|could not agree more|so true|well said|100%|absolutely|spot on|this resonates|this is gold|totally agree|fully agree|agreed\b|well put|very true|good point|great point)/i;

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
 * One emoji, including a ZWJ sequence, as a single unit.
 *
 * The old strip matched bare code points, which does not matter when every one
 * of them is deleted but does once they are being counted — a two-person
 * emoji would otherwise count as three.
 *
 * Regional-indicator flags sit below U+1F300 and are matched by neither the old
 * pattern nor this one. That is unchanged behaviour, not a regression.
 */
const EMOJI_CLUSTER =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?(?:\u{200D}[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?)*/gu;

export interface PolishOptions {
  /** Default false, so every existing caller keeps today's behaviour exactly. */
  allowEmoji?: boolean;
  /** Emoji past this are stripped, earliest kept. Default 1. */
  maxEmoji?: number;
}

/**
 * Strip the tells the prompt bans but models emit anyway.
 *
 * Rejecting on these would throw away otherwise good comments, and a retry
 * costs a second model call — so formatting slips are fixed here and only
 * substantive failures (flattery, emptiness) are rejected.
 */
export function polishComment(raw: string, options: PolishOptions = {}): string {
  const { allowEmoji = false, maxEmoji = 1 } = options;

  let kept = 0;
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    // Em/en dashes read as machine-written in a LinkedIn comment.
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/#\w+/g, "")
    .replace(EMOJI_CLUSTER, (match) => {
      if (!allowEmoji) return "";
      // Keeping the first few and dropping the rest stops a model that
      // decorates every clause, without throwing the comment away over it.
      kept += 1;
      return kept <= maxEmoji ? match : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

export interface QualityOptions {
  minLength?: number;
  /**
   * Let the comment open with congratulations.
   *
   * Set for a celebration — a promotion, a new role, a launch. The comment
   * still has to say something beyond the congratulation, which `minSubstance`
   * enforces.
   */
  allowCongratulation?: boolean;
  /**
   * Let the comment open with a warm adjective.
   *
   * Light registers only. Relaxes the adjective opener and NOTHING else: the
   * empty-agreement phrases and the sycophancy list stay banned in every
   * register, so "amazing, the second one got me" gets through and "so true"
   * never does.
   */
  allowPraise?: boolean;
  /** How much has to follow a congratulation before it stops being boilerplate. */
  minSubstance?: number;
  /**
   * Comments already posted. A character-identical repeat never goes out twice.
   *
   * Exact matching only. Near-repetition is steered away from in the prompt
   * instead, because rejecting on it would force a second model call on every
   * post that happened to land close to an earlier one.
   */
  recentComments?: string[];
}

/** Comparable form of a comment: case, spacing and edge punctuation removed. */
function normaliseForCompare(comment: string): string {
  return comment.toLowerCase().replace(/\s+/g, " ").replace(/^\W+|\W+$/g, "").trim();
}

/** Why this comment is unpostable, or null if it is fine. */
export function rejectReason(
  comment: string,
  options: number | QualityOptions = {}
): string | null {
  // Callers used to pass a bare minimum length; keep that working.
  const {
    minLength = 15,
    allowCongratulation = false,
    allowPraise = false,
    minSubstance = 25,
    recentComments = [],
  } = typeof options === "number" ? { minLength: options } : options;

  if (!comment || comment.length < minLength) return "came back empty or too short";

  if (!allowPraise && PRAISE_ADJECTIVE_OPENER.test(comment)) return "opened with flattery";
  if (PRAISE_PHRASE_OPENER.test(comment)) return "opened with empty agreement";

  if (CONGRATS_OPENER.test(comment)) {
    if (!allowCongratulation) return "opened with flattery";
    // "Congratulations!" and nothing else is still boilerplate. Anything past
    // the congratulation is the part that makes it worth posting.
    const rest = comment.replace(CONGRATS_OPENER, "").replace(/^\W+/, "").trim();
    if (rest.length < minSubstance) {
      return "was a bare congratulation with nothing behind it";
    }
  }

  if (SYCOPHANCY.test(comment)) return "was generic praise";

  if (recentComments.length > 0) {
    const candidate = normaliseForCompare(comment);
    if (recentComments.some((prior) => normaliseForCompare(prior) === candidate)) {
      return "was word-for-word something I already posted";
    }
  }

  return null;
}

export interface RegisterPolicy {
  allowEmoji: boolean;
  maxEmoji: number;
  allowPraise: boolean;
  allowCongratulation: boolean;
  minLength: number;
  minSubstance: number;
}

/**
 * What a register is allowed to do.
 *
 * One function so the gate and the prompt can never drift apart, and so the
 * vetoes are in one readable place rather than scattered through the route.
 */
export function policyFor(
  register: CommentRegister,
  opts: { isPitch: boolean; postType: string; band: LengthBand }
): RegisterPolicy {
  const { isPitch, postType, band } = opts;

  // A pitch is never warm, never short and never decorated. The author asked
  // for people; this is the one comment being read as an application.
  if (isPitch) {
    return {
      allowEmoji: false,
      maxEmoji: 0,
      allowPraise: false,
      allowCongratulation: false,
      minLength: 40,
      minSubstance: 25,
    };
  }

  if (register === "analytical") {
    return {
      allowEmoji: false,
      maxEmoji: 0,
      allowPraise: false,
      allowCongratulation: false,
      minLength: 15,
      minSubstance: 25,
    };
  }

  // A reaction is three to eight words, so the floors that keep a standard
  // comment honest would reject every one of them. Twelve characters is where
  // a reaction still has a subject in it: "called it, twice" survives, "lol"
  // does not.
  const short = band === "reaction";

  return {
    // Emoji follow the register, except on a technical post, where they
    // undercut the comment in front of exactly the people worth impressing.
    allowEmoji: postType !== "technical",
    maxEmoji: 1,
    allowPraise: true,
    allowCongratulation: register === "celebratory",
    minLength: short ? 12 : 15,
    minSubstance: short ? 12 : 25,
  };
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
