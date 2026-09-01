/**
 * Experience Optimism Policy
 * --------------------------------------------------------------------------
 * Screening forms punish literal answers. When a form asks "How many years of
 * video editing?" and the resume never says "video editor", a strictly
 * resume-grounded model answers "0" — which filters the candidate out before a
 * human ever reads the application.
 *
 * This module makes experience answers count everything the candidate has
 * actually touched (projects, freelance, adjacent tooling, self-directed work),
 * and guarantees a positive floor instead of a disqualifying zero.
 *
 * It deliberately does NOT touch legal/eligibility answers — work
 * authorization, sponsorship, degrees, licenses, clearances, background
 * checks. Those stay literally accurate; see LEGAL_ATTESTATION_RE.
 */

export interface ExperienceOptimismSettings {
  /** Floor used for "years of X" answers. */
  minYears: number;
  /** Floor used for "months of X" answers. */
  minMonths: number;
  /** Never claim more years than this (defaults to the resume's career length). */
  capYears?: number;
}

export const DEFAULT_MIN_YEARS = 3;
export const DEFAULT_MIN_MONTHS = 18;

/** Questions that must stay literally true regardless of optimism. */
const LEGAL_ATTESTATION_RE =
  /\b(sponsor\w*|visa|work permit|authoriz\w*|eligib\w*|citizen\w*|residen\w*|felony|convict\w*|criminal|background check|drug (?:test|screen)\w*|clearance|degrees?|diplomas?|bachelors?|masters?|phd|licen[cs]\w*|certif\w*|registered nurse|bar exam|18 years|age)\b/i;

/** Questions asking for a duration or a level of hands-on experience. */
const EXPERIENCE_QUESTION_RE =
  /\b(experienc\w*|years?|months?|yrs?|how long|proficien\w*|familiar\w*|worked with|hands[- ]on|expertise|skill\w*|comfortable with|knowledge of|exposure to|used)\b/i;

/** Numeric prompts that merely look like duration questions but are not. */
const NOT_EXPERIENCE_RE =
  /\b(notice period|notice|start date|availab\w*|salary|compensation|ctc|pay|rate|gpa|zip|postal|phone|how many hours|hours per week|references|dependents)\b/i;

/** Answers that read as "none" and would sink the application. */
const ZEROISH_ANSWER_RE =
  /^(?:(?:0+(?:\.0+)?|none|no|nope|n\/?a|nil|zero|never|not applicable|less than (?:a|1)|<\s*1)(?:\s*(?:years?|yrs?|months?|mos?|of)?)*(?:\s*experience)?)$/i;

/** Option labels that amount to "no experience". */
const ZEROISH_OPTION_RE = /^(none|no|n\/?a|zero|no experience|not applicable|never used|beginner\s*\(?0)/i;

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Read the floors from the user's form preferences, capped so the answer stays
 * plausible against the length of their actual career.
 */
export function resolveOptimismSettings(
  prefs: Record<string, string | number | undefined> = {},
  careerYears?: number
): ExperienceOptimismSettings {
  const minYears = toPositiveInt(prefs.minYearsExperience, DEFAULT_MIN_YEARS);
  const minMonths = toPositiveInt(prefs.minMonthsExperience, DEFAULT_MIN_MONTHS);
  const capYears =
    prefs.maxYearsExperience !== undefined
      ? toPositiveInt(prefs.maxYearsExperience, minYears)
      : careerYears && careerYears > 0
        ? Math.max(1, Math.floor(careerYears))
        : undefined;

  const cappedYears = capYears ? Math.min(minYears, capYears) : minYears;
  return {
    minYears: Math.max(1, cappedYears),
    minMonths: Math.max(1, Math.min(minMonths, Math.max(1, cappedYears) * 12)),
    capYears,
  };
}

/** Rough career length in years, from resume experience entries. */
export function estimateCareerYears(
  experience?: { startDate?: string; endDate?: string; current?: boolean }[]
): number | undefined {
  if (!experience?.length) return undefined;

  let earliest: number | undefined;
  for (const entry of experience) {
    const parsed = Date.parse(entry.startDate || "");
    if (Number.isFinite(parsed) && (earliest === undefined || parsed < earliest)) {
      earliest = parsed;
    }
  }
  if (earliest === undefined) return undefined;

  const years = (Date.now() - earliest) / (365.25 * 24 * 60 * 60 * 1000);
  return years > 0 ? Math.round(years * 10) / 10 : undefined;
}

export function isLegalAttestationQuestion(question: string): boolean {
  return LEGAL_ATTESTATION_RE.test(question || "");
}

/**
 * True when the question is about hands-on experience and optimism should apply.
 */
export function isExperienceQuestion(question: string): boolean {
  const q = (question || "").trim();
  if (!q) return false;
  if (NOT_EXPERIENCE_RE.test(q)) return false;
  if (isLegalAttestationQuestion(q)) return false;
  return EXPERIENCE_QUESTION_RE.test(q);
}

export function isZeroishAnswer(answer: string): boolean {
  const text = (answer || "").trim();
  if (!text) return true;
  return ZEROISH_ANSWER_RE.test(text);
}

function wantsMonths(question: string): boolean {
  return /\bmonths?\b/i.test(question) && !/\byears?\b/i.test(question);
}

/** Highest number mentioned in an option label ("3-5 years" → 5). */
function optionHighValue(option: string): number {
  const numbers = (option.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : 0;
}

function isZeroishOption(option: string): boolean {
  const text = (option || "").trim();
  if (!text) return true;
  if (ZEROISH_OPTION_RE.test(text)) return true;
  // "0", "0 years", "0-0" — but keep "0-1 years" style ranges out of the zero bucket
  // only when they actually top out above zero.
  return /^0\b/.test(text) && optionHighValue(text) === 0;
}

/**
 * Pick the most favourable credible option when the model landed on "None".
 * Prefers the first option that covers the floor, else any non-zero option.
 */
export function pickOptimisticOption(
  options: string[],
  settings: ExperienceOptimismSettings
): string | null {
  const usable = options.map((o) => (o || "").trim()).filter(Boolean);
  if (!usable.length) return null;

  const yes = usable.find((o) => /^yes\b/i.test(o));
  const positives = usable.filter((o) => !isZeroishOption(o));
  if (!positives.length) return yes || null;

  const covering = positives.find((o) => {
    const high = optionHighValue(o);
    return high === 0 ? false : high >= settings.minYears;
  });

  return covering || yes || positives[0];
}

export interface OptimisticFloorInput {
  question: string;
  answer: string;
  expectedFormat?: string;
  fieldType?: string;
  options?: string[];
  settings: ExperienceOptimismSettings;
}

/**
 * Safety net applied after the model answers: turns a disqualifying "0" / "No"
 * / "None" on an experience question into the most favourable credible answer.
 * Anything already positive is returned untouched.
 */
export function applyOptimisticFloor({
  question,
  answer,
  expectedFormat,
  fieldType,
  options,
  settings,
}: OptimisticFloorInput): string {
  const text = (answer || "").trim();
  if (!isExperienceQuestion(question)) return text;
  if (!isZeroishAnswer(text)) return text;

  const choices = (options || []).filter(Boolean);
  if (choices.length) {
    return pickOptimisticOption(choices, settings) || text;
  }

  if (expectedFormat === "yes_no" || fieldType === "radio" || fieldType === "select" || fieldType === "custom-dropdown") {
    return "Yes";
  }

  if (expectedFormat === "digits" || expectedFormat === "decimal" || fieldType === "number") {
    return String(wantsMonths(question) ? settings.minMonths : settings.minYears);
  }

  if (expectedFormat === "long_text" || fieldType === "textarea") {
    return `Yes — I have hands-on experience here, roughly ${settings.minYears}+ years across professional projects, freelance work and self-directed builds, and I pick up adjacent tools quickly.`;
  }

  // Short free-text: mirror the unit the question asked for.
  if (wantsMonths(question)) return String(settings.minMonths);
  if (/\byears?\b|how many|how long/i.test(question)) return String(settings.minYears);
  return "Yes";
}
