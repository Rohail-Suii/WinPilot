/**
 * "Is this job anything to do with me?"
 *
 * The model cannot be trusted with this question in either direction. Asked
 * loosely it applies to anything; asked strictly it refuses every post whose
 * tool list is not an exact match. So the decision is made here, in code, from
 * the user's real history — and the model only ever gets to write the email for
 * a post that has already passed.
 *
 * Everything here is pure: no database, no network, no model. The profile it
 * scores against is loaded separately in ./relevance-profile, so the scoring
 * can be read and tested on its own.
 *
 * The gate is occupation-level, not tool-level, and that is deliberate. A
 * full-stack JavaScript engineer applying for a WordPress role is applying
 * within their own profession and should; the same person applying for a
 * Registered Nurse post is not, however many words the two posts share. Tool
 * overlap is reported as a score and only becomes a hard requirement when the
 * user turns on strict matching.
 */

import { normalizeText } from "./hiring-post";

export interface RelevanceProfile {
  /** Tools, languages and frameworks this person has actually used. */
  skills: string[];
  /** Titles they have actually held, plus their headline. */
  titles: string[];
}

export interface RelevanceVerdict {
  related: boolean;
  /**
   * Whether this is a decision or a shrug.
   *
   * "This is nursing and you write software" is certain. "This post names no
   * occupation and none of your tools" is not — it is the absence of evidence,
   * and it belongs in front of a person rather than in the bin.
   */
  certain: boolean;
  /** 0–1. Share of the post's demands the profile can answer. Reported, not decisive. */
  score: number;
  /** The user's own skills that this post names. */
  matchedSkills: string[];
  /** The occupation the post is for, when it can be named. */
  postField: string;
  /** The occupations the user's own history sits in. */
  ownFields: string[];
  reason: string;
}

/**
 * Occupations, in the order they are tested, as the phrases that name them.
 *
 * Order matters: "mechanical engineer" and "sales engineer" have to be claimed
 * by their own families before the software family sees the word "engineer".
 *
 * They are stored as terms rather than finished regexes so that one compiler
 * can put the same guards on all of them — plural tolerance ("Sales
 * Executives"), and edges that stop "java" matching inside "javascript".
 * Getting that wrong on one family out of fourteen is exactly the kind of bug
 * that shows up as one unwanted application months later.
 */
const FIELD_TERMS: [string, string[]][] = [
  ["healthcare", ["nurse", "nursing", "physician", "doctor", "surgeon", "pharmacist", "dentist", "paramedic", "radiolog(?:y|ist)", "physiotherapist", "caregiver", "medical officer", "clinical (?:officer|assistant)"]],
  ["legal", ["lawyer", "attorney", "solicitor", "paralegal", "legal (?:counsel|advisor|associate)", "advocate"]],
  ["finance", ["accountant", "accounting", "bookkeeper", "bookkeeping", "auditor", "audit associate", "financial analyst", "tax (?:consultant|associate)", "actuary", "acca", "cfa"]],
  ["physical_engineering", ["(?:mechanical|civil|electrical|chemical|structural|petroleum|mining|industrial) (?:engineer|engineering|technician|draftsman)", "site engineer", "quantity surveyor", "autocad (?:draftsman|operator)"]],
  ["logistics", ["driver", "rider", "courier", "warehouse (?:worker|associate|manager)", "forklift operator", "dispatcher", "supply chain", "logistics (?:coordinator|officer|executive)", "store ?keeper"]],
  ["education", ["teacher", "tutor", "lecturer", "professor", "instructor", "academic coordinator", "principal"]],
  ["hr", ["recruiter", "recruitment (?:officer|executive|consultant|specialist)", "talent acquisition", "hr (?:officer|executive|manager|generalist|assistant)", "human resources"]],
  ["sales", ["sales (?:executive|representative|rep|manager|officer|associate|agent|engineer)", "pre[- ]?sales", "business development (?:executive|manager|representative)", "account executive", "telesales", "inside sales"]],
  ["support", ["customer (?:support|service|success)", "call cent(?:er|re)", "help ?desk", "virtual assistant", "live chat agent", "receptionist", "data entry"]],
  ["marketing", ["digital marketer", "digital marketing", "seo (?:specialist|expert|executive)", "social media (?:manager|executive|marketer)", "content writer", "copywriter", "media buyer", "brand manager", "marketing (?:executive|manager|intern)"]],
  ["design", ["ui ?/? ?ux designer", "ux designer", "ui designer", "graphic designer", "product designer", "motion designer", "illustrator", "video editor", "3d artist"]],
  ["product", ["product (?:manager|owner)", "project manager", "scrum master", "business analyst", "program manager", "delivery manager"]],
  ["data", ["data (?:scientist|analyst|engineer)", "machine learning", "ml engineer", "ai engineer", "deep learning", "nlp engineer", "business intelligence", "data warehouse"]],
  ["software", [
    "(?:software|web|website|frontend|front[- ]end|backend|back[- ]end|full[- ]?stack|mobile|android|ios|game|blockchain|cloud|platform|systems?) (?:developer|engineer|programmer|architect)",
    "developer", "programmer", "devops", "sre", "site reliability", "qa (?:engineer|automation)", "test automation",
    "wordpress", "shopify", "webflow", "laravel", "django", "rails", "node\\.?js", "react", "angular", "vue", "flutter", "php", "python", "golang",
  ]],
];

/**
 * One family's terms as a single pattern.
 *
 * The lookarounds do what `\b` cannot: `\b` after "executive" refuses to match
 * "executives", and `\b` around "node.js" breaks on the dot. Allowing an
 * optional plural inside the guard fixes both.
 */
const FIELDS: [string, RegExp][] = FIELD_TERMS.map(([field, terms]) => [
  field,
  new RegExp(`(?<![A-Za-z0-9])(?:${terms.join("|")})(?:s|es)?(?![A-Za-z0-9])`, "i"),
]);

/** Name the occupations a piece of text is about, most specific first. */
export function fieldsOf(text: string): string[] {
  const value = normalizeText(text);
  const found: string[] = [];
  for (const [field, pattern] of FIELDS) {
    if (pattern.test(value) && !found.includes(field)) found.push(field);
  }
  return found;
}

/**
 * Occupations that sit next door to each other.
 *
 * A neighbour is not the same as your own field, so it does not get in for
 * free: an adjacent role has to name at least one thing the person has actually
 * used. That is what separates a Data Engineer post asking for Node and
 * Postgres — worth applying to — from a Data Scientist post asking for pandas
 * and scikit-learn, or a Graphic Designer post that shares nothing but the word
 * "designer" with a front-end career.
 */
const ADJACENT: Record<string, string[]> = {
  software: ["data", "product", "design"],
  data: ["software", "product"],
  design: ["software", "product"],
  product: ["software", "data"],
};

/** Match a skill as a whole term, tolerating the dots and pluses in tech names. */
function skillPattern(skill: string): RegExp | null {
  const cleaned = skill.trim().replace(/\s+/g, " ");
  if (cleaned.length < 2) return null;
  const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b does not work after "+" or ".", so the edges are guarded by "not a word
  // character" instead — that still stops "java" matching inside "javascript".
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
}

/**
 * Skills the post names that this person has actually used.
 *
 * Compound entries like "REST & Webhooks" are split, because a post asks for
 * "webhooks", never for the phrase the profile happens to store.
 */
export function matchSkills(postText: string, skills: string[]): string[] {
  const text = normalizeText(postText);
  const matched = new Set<string>();

  for (const raw of skills) {
    for (const part of raw.split(/[,/&]| and /i)) {
      const skill = part.trim();
      const pattern = skillPattern(skill);
      if (pattern && pattern.test(text)) {
        matched.add(skill);
        break;
      }
    }
  }

  return [...matched];
}

/** Roughly how many distinct requirements a post lists, for the score's denominator. */
function demandCount(postText: string): number {
  const lines = normalizeText(postText)
    .split(/\n|[•\-–]\s/)
    .filter((l) => l.trim().length > 15);
  return Math.max(4, Math.min(20, lines.length));
}

export interface RelevanceOptions {
  /** Require at least one tool the person has actually used, not just the field. */
  strictSkillMatch?: boolean;
}

/**
 * Decide whether this opening is in the user's line of work.
 *
 * Three outcomes, in order of authority:
 *   1. The post names an occupation that is not theirs and is not adjacent to
 *      it — unrelated, whatever else the text says.
 *   2. The post names their occupation (or an adjacent one) — related, unless
 *      strict matching is on and the post names nothing they have used.
 *   3. The post names no occupation this file recognises — fall back to needing
 *      two of their own skills in the text, so an unrecognised trade cannot slip
 *      through on hiring language alone.
 */
export function assessRelevance(
  input: { roleTitle?: string; postContent: string },
  profile: RelevanceProfile,
  options: RelevanceOptions = {}
): RelevanceVerdict {
  const postText = `${input.roleTitle || ""}\n${input.postContent}`;
  // The title is where the occupation is stated; the body is full of the
  // company's other departments, its clients and its tech stack.
  const postFields = fieldsOf(input.roleTitle || "").length
    ? fieldsOf(input.roleTitle || "")
    : fieldsOf(input.postContent);

  const ownFields = fieldsOf(`${profile.titles.join(". ")}. ${profile.skills.join(", ")}`);
  const matchedSkills = matchSkills(postText, profile.skills);
  const score = Number(Math.min(1, matchedSkills.length / demandCount(input.postContent)).toFixed(2));

  const base = { score, matchedSkills, postField: postFields[0] || "", ownFields };

  if (postFields.length > 0 && ownFields.length > 0) {
    const own = new Set(ownFields);
    const adjacent = new Set(ownFields.flatMap((f) => ADJACENT[f] || []));
    const sameField = postFields.some((f) => own.has(f));
    const nextDoor = !sameField && postFields.some((f) => adjacent.has(f));

    if (!sameField && !nextDoor) {
      return {
        ...base,
        related: false,
        certain: true,
        reason: `this is ${postFields[0].replace(/_/g, " ")} work and your background is ${ownFields.join(", ").replace(/_/g, " ")}`,
      };
    }

    // A neighbouring field has to show its working. Your own never has to.
    if (nextDoor && matchedSkills.length === 0) {
      return {
        ...base,
        related: false,
        certain: true,
        reason: `this is ${postFields[0].replace(/_/g, " ")} work rather than yours, and it names nothing you have actually used`,
      };
    }

    if (options.strictSkillMatch && matchedSkills.length === 0) {
      return {
        ...base,
        related: false,
        certain: true,
        reason: "strict matching is on and the post names nothing you have actually used",
      };
    }

    return {
      ...base,
      related: true,
      certain: true,
      reason: nextDoor
        ? `next door to your field, and it asks for ${matchedSkills.slice(0, 4).join(", ")}`
        : matchedSkills.length
          ? `in your field, and it asks for ${matchedSkills.slice(0, 4).join(", ")}`
          : "in your field, though it names none of your specific tools",
    };
  }

  // Nothing recognisable was named. Two of the person's own skills in the text
  // is a low bar, but it is evidence rather than the absence of it.
  const enough = matchedSkills.length >= 2;
  return {
    ...base,
    related: enough,
    // Nothing was recognised either way, so this is a guess whichever way it
    // fell. Capture turns an unconfident "no" into a question for the user.
    certain: false,
    reason: enough
      ? `not a role I recognise by name, but it asks for ${matchedSkills.slice(0, 4).join(", ")}`
      : "I could not tell what line of work this is, and it names nothing you have used",
  };
}
