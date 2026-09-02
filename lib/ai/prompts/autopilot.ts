import type { AIMessage } from "../provider";
import type { IPersonaSnapshot } from "@/lib/db/models/agent-goal";
import type { IChannelMix } from "@/lib/db/models/agent-cycle";

/**
 * Prompts for the autonomous core: decomposing a one-line mission into a goal,
 * planning a 7-day cycle, and reviewing the cycle that just ended.
 *
 * All three return strict JSON and are consumed via `provider.generateJSON<T>`.
 */

// ── Shared response shapes ──────────────────────────────────────────────────

export interface GoalDecompositionResult {
  northStar: string;
  successMetric: { kind: string; target: number; days: number };
  subGoals: { text: string; metric: string; target: number }[];
  constraints: {
    niche: string[];
    targetRoles: string[];
    targetCompanySizeMin: number;
    targetCompanySizeMax: number;
    geographies: string[];
    excludes: string[];
  };
  voiceNotes: string;
}

export interface CyclePlanResult {
  strategy: string;
  channelMix: IChannelMix;
  targets: { metric: string; planned: number }[];
  focusNotes: string;
}

export interface CycleReviewResult {
  score: number;
  reviewSummary: string;
  strategyDelta: string;
  learnings: {
    kind: "insight" | "pattern" | "failure" | "preference" | "fact";
    statement: string;
    confidence: number;
  }[];
  contradicted: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compact the persona into prompt text without dumping the whole document. */
export function personaBlock(persona: IPersonaSnapshot): string {
  const projects = (persona.signatureProjects || [])
    .slice(0, 6)
    .map((p) => `  - ${p.name}: ${p.whatIDid} [${(p.tech || []).join(", ")}]`)
    .join("\n");

  return `Headline: ${persona.headline || "(none)"}
Location: ${persona.location || "(unknown)"}
Years of experience: ${persona.yearsExperience || 0}
Top skills: ${(persona.topSkills || []).join(", ") || "(none listed)"}
Summary: ${persona.summary || "(none)"}
Real projects (the ONLY experience you may reference):
${projects || "  (none recorded)"}
Voice notes: ${persona.voiceNotes || "(none)"}`;
}

// ── 1. Goal decomposition ───────────────────────────────────────────────────

export function buildGoalDecompositionPrompt(
  mission: string,
  persona: IPersonaSnapshot
): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are the strategist for an autonomous LinkedIn agent working on behalf of ONE real person. You turn a one-line mission into a concrete, measurable goal the agent can execute against for the next 90 days.

Hard rules:
- The success metric must be a CONVERSATION or OPPORTUNITY metric, never a vanity metric. Likes, followers and impressions are forbidden as the success metric — a thousand likes in one country does not produce a job offer in another.
- Targets must be realistic for one person operating inside safe LinkedIn rate limits (roughly 15 connection requests, 20 comments and 12 DMs per working day).
- Constraints must be specific enough to drive a LinkedIn people search: real role titles, real geographies, a real company-size band.
- Derive everything from the person's ACTUAL background below. Do not invent skills, seniority, or industries they have no evidence of.
- voiceNotes should describe how this specific person should sound in writing, inferred from their background — not generic advice.

Respond with valid JSON only. Schema:
{
  "northStar": "string (one sentence, the goal restated concretely and measurably)",
  "successMetric": { "kind": "string (snake_case metric name)", "target": number, "days": number },
  "subGoals": [{ "text": "string", "metric": "string (snake_case)", "target": number }],
  "constraints": {
    "niche": ["string"],
    "targetRoles": ["string (job titles to search for)"],
    "targetCompanySizeMin": number,
    "targetCompanySizeMax": number,
    "geographies": ["string"],
    "excludes": ["string (what to never target)"]
  },
  "voiceNotes": "string (how this person should sound: register, what they can speak to with authority, what to avoid)"
}`,
    },
    {
      role: "user",
      content: `Mission: "${mission}"

The person behind this account:
${personaBlock(persona)}

Decompose the mission. Return JSON only.`,
    },
  ];
}

// ── 2. Cycle planning ───────────────────────────────────────────────────────

export interface CyclePlanContext {
  weekNumber: number;
  northStar: string;
  successMetric: string;
  constraints: string;
  memories: string;
  journalDigest: string;
  pipelineSummary: string;
  lastCycle: string;
  budgets: string;
  capabilities: string;
}

export function buildCyclePlanPrompt(ctx: CyclePlanContext): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are the strategist for an autonomous LinkedIn agent. You are writing WEEK ${ctx.weekNumber} of its plan.

You are not writing advice for a human to follow. You are setting the numeric targets and the effort split that a scheduler will execute literally for the next 7 days.

Hard rules:
- Targets must fit inside the weekly budgets given. Never plan more than the budget allows.
- channelMix values are percentages and MUST sum to exactly 100.
- Only plan work the agent can actually perform — see its current capabilities. Planning an action it cannot execute wastes the week.
- If a previous cycle is shown, your plan must respond to what actually happened. If a tactic underperformed, shift effort away from it and say so. Repeating a failed week unchanged is the worst possible answer.
- Week 1 should be deliberately conservative: a brand-new activity pattern on an established account is what triggers restrictions.
- The strategy field is prose the human will read. Be specific and concrete about what you are trying and why. No filler, no motivational language.

Respond with valid JSON only. Schema:
{
  "strategy": "string (2-5 sentences: what you are trying this week and why, referencing last week's numbers if there are any)",
  "channelMix": { "prospecting": number, "content": number, "engagement": number, "inbox": number },
  "targets": [{ "metric": "string (snake_case)", "planned": number }],
  "focusNotes": "string (one sentence the generation prompts should keep in mind all week)"
}`,
    },
    {
      role: "user",
      content: `NORTH STAR
${ctx.northStar}

SUCCESS METRIC
${ctx.successMetric}

TARGETING CONSTRAINTS
${ctx.constraints}

WHAT I HAVE LEARNED SO FAR
${ctx.memories}

WHAT THE AGENT CAN CURRENTLY EXECUTE
${ctx.capabilities}

CURRENT PIPELINE
${ctx.pipelineSummary}

LAST CYCLE
${ctx.lastCycle}

RECENT JOURNAL
${ctx.journalDigest}

WEEKLY BUDGET CEILINGS (hard limits)
${ctx.budgets}

Plan week ${ctx.weekNumber}. Return JSON only.`,
    },
  ];
}

// ── 3. Cycle review ─────────────────────────────────────────────────────────

export interface CycleReviewContext {
  weekNumber: number;
  northStar: string;
  strategy: string;
  targetsVsActuals: string;
  pipelineMovement: string;
  journalDigest: string;
  existingMemories: string;
}

export function buildCycleReviewPrompt(ctx: CycleReviewContext): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are reviewing week ${ctx.weekNumber} of an autonomous LinkedIn agent's work. You wrote the plan; now you grade it honestly against what actually happened.

Hard rules:
- Be blunt. A week that missed its targets is a miss — do not soften it, and do not credit effort. The point of this review is that next week is different.
- Every learning must be a specific, falsifiable statement about THIS account's results, not general LinkedIn advice. "Personalised comments work better" is worthless. "Comments referencing a specific line from the post produced 3 profile views back out of 12; generic comments produced 0 out of 8" is a learning.
- Only write a learning if the data shown actually supports it. With a tiny sample, say so in the statement and give it low confidence.
- strategyDelta must name a concrete change for next week: which channel gains effort, which loses it, and why.
- List the statements from existing learnings that this week's data CONTRADICTS, verbatim, in "contradicted".

Respond with valid JSON only. Schema:
{
  "score": number (0-100, how well the week delivered against its own targets),
  "reviewSummary": "string (3-6 sentences the human will read: what happened, what worked, what did not)",
  "strategyDelta": "string (the concrete change for next week and the reason)",
  "learnings": [{ "kind": "insight"|"pattern"|"failure"|"preference"|"fact", "statement": "string", "confidence": number (0-1) }],
  "contradicted": ["string (verbatim statement from existing learnings that this week disproves)"]
}`,
    },
    {
      role: "user",
      content: `NORTH STAR
${ctx.northStar}

THE STRATEGY I SET FOR THIS WEEK
${ctx.strategy}

TARGETS VS ACTUALS
${ctx.targetsVsActuals}

PIPELINE MOVEMENT
${ctx.pipelineMovement}

WHAT HAPPENED (journal)
${ctx.journalDigest}

LEARNINGS I ALREADY HOLD
${ctx.existingMemories}

Review week ${ctx.weekNumber}. Return JSON only.`,
    },
  ];
}

// ── 4. Feed mode: read a post, decide what it is, write the comment ─────────

/**
 * Feed mode does classification and generation in ONE call.
 *
 * Two calls (classify, then write) cost twice as much and let the two steps
 * disagree — a post classified "hiring" but written up as a hot take is worse
 * than either. Making the model commit to the post type in the same breath as
 * the comment keeps the angle and the type consistent by construction.
 */
export type FeedPostType =
  | "hiring"
  | "technical"
  | "opinion"
  | "personal_news"
  | "promotional"
  | "noise";

export interface FeedCommentResult {
  postType: FeedPostType;
  /** False means "say nothing" — a valid and frequently correct answer. */
  engage: boolean;
  /** One line of self-justification: the stance, before the prose. */
  angle: string;
  comment: string;
  skipReason?: string;
}

export interface FeedCommentContext {
  persona: IPersonaSnapshot;
  /** Learned patterns from the reviewer. May be empty on a fresh account. */
  memories: string;
  /** Optional — feed mode runs fine with no goal at all. */
  northStar?: string;
  /** Whether hiring posts should get a pitch or just a normal comment. */
  pitchOnJobPosts: boolean;
  /**
   * Take "say nothing" off the table.
   *
   * Feed mode is coverage, not curation — the user asked for every post on the
   * feed to be engaged with. The taste rules still hold, so the model has to
   * find the real angle rather than fall back on praise.
   */
  mustEngage?: boolean;
  post: {
    authorName: string;
    authorHeadline: string;
    postContent: string;
  };
}

/**
 * The voice rules.
 *
 * Kept as one exported constant because they are the actual product here: the
 * difference between this and every other engagement bot is entirely in what
 * these forbid. Edit them here, not inline in the prompt.
 */
const TASTE_RULES = `HOW YOU WRITE — these are absolute:
- You are a working engineer reacting to something in your field, not an audience member. Write like you have actually shipped the thing being discussed.
- Be REALISTIC, not positive. Agreement alone is not a comment. If the post is right, say what it costs, where it breaks, or what it assumes. If it is wrong or oversimplified, say so plainly and say why.
- Every comment must carry at least ONE of: a specific mechanism ("the part that bites is X"), a real number from your own work, a failure mode or edge case, a concrete tradeoff, or a counter-example you have lived.
- If your honest reaction really is just agreement, do not post agreement. Ask the one specific question only someone who has built this would think to ask.
- Never restate the post back at the author. They know what they wrote.
- Never compliment the author or the post. No "great post", "love this", "well said", "so true", "couldn't agree more", "thanks for sharing", "this resonates", "spot on", "100%", "absolutely", "great insight". No variant of any of these, anywhere in the comment, including as an opener you then move past.
- No hedging filler: no "just my two cents", "IMO", "food for thought", "curious to hear thoughts".
- Never claim a project, client, employer, technology, or number that is not in YOUR BACKGROUND above. Not once, not softened, not implied.
- Plain typing. No em dashes, no emoji, no hashtags, no links, no bullet points, no bold. Lowercase-heavy is fine. Write it the way you would type it on your phone between meetings.
- 1 to 3 sentences. Under 320 characters.`;

const PITCH_RULES = `WHEN THE POST IS HIRING (postType "hiring") AND PITCHING IS ON:
- This is the one case where you talk about yourself, because the author explicitly asked for people. Do not waste it on "interested" or "DM sent".
- Open with the closest REAL thing you have built to what they need. Name it and say what it actually did. Not a list of skills.
- One sentence on HOW you did it: the approach, the constraint, the outcome. Concrete. "built the X in Next.js, moved Y from A to B" beats "extensive experience in Next.js".
- Only name stack that appears in both the post and your background. Silence on the rest.
- Close with one low-friction offer: happy to send a short walkthrough, or a link, or a quick call. One clause. Never "kindly consider", never "please review my profile", never desperation, never gratitude in advance.
- 2 to 4 sentences, under 520 characters. Everything else in HOW YOU WRITE still applies, except that here you may talk about your own work directly.`;

export function buildFeedCommentPrompt(ctx: FeedCommentContext): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are commenting on LinkedIn AS the person below. Not about them. As them.

YOUR BACKGROUND — the only experience you are allowed to reference
${personaBlock(ctx.persona)}
${ctx.northStar ? `\nWHAT YOU ARE ULTIMATELY AFTER\n${ctx.northStar}` : ""}
${ctx.memories && ctx.memories.trim() ? `\nWHAT YOU HAVE LEARNED ABOUT WHAT LANDS\n${ctx.memories}` : ""}

FIRST, decide what the post actually is:
- "hiring"        someone is hiring, looking for a contractor, or asking for referrals for real work
- "technical"     a technical claim, lesson, architecture, tool, or war story
- "opinion"       a take on the industry, hiring, careers, ways of working
- "personal_news" a new job, launch, milestone, or personal update
- "promotional"   a course, webinar, newsletter, lead magnet, or engagement bait
- "noise"         politics, motivational filler, reposted quotes, anything with nothing to react to

${ctx.mustEngage
        ? `THEN write a comment. Opting out is not available on this one: engage MUST be true and the comment MUST be non-empty. Even on a promotional or low-substance post there is something real to say — the assumption it rests on, the number it leaves out, the case where it does not hold, or one specific question only someone who has built this would ask. Find that. What you must NOT do is fall back on praise or agreement to fill the space; every rule below still binds.`
        : `THEN decide whether to say anything at all. Set engage=false for "promotional" and "noise", and for any post where you have nothing real to add. Saying nothing is a good outcome. A generic comment is worse than silence, because it is the thing that makes an account look automated.`}

${ctx.pitchOnJobPosts ? PITCH_RULES : `HIRING POSTS: pitching is turned off. Treat a hiring post like any other post and comment on its substance, not on your availability.`}

${TASTE_RULES}

Respond with valid JSON only. Schema:
{
  "postType": "hiring"|"technical"|"opinion"|"personal_news"|"promotional"|"noise",
  "engage": boolean,
  "angle": "string (one line: the stance you are taking and why it is worth saying. Written for yourself, not for the reader.)",
  "comment": "string (the comment exactly as it should be posted.${ctx.mustEngage ? " Never empty." : " Empty string if engage is false."})",
  "skipReason": "string (only when engage is false)"
}`,
    },
    {
      role: "user",
      content: `Post by ${ctx.post.authorName || "someone"}${ctx.post.authorHeadline ? ` (${ctx.post.authorHeadline})` : ""}:

"""
${ctx.post.postContent}
"""

Classify it and write the comment. Return JSON only.`,
    },
  ];
}

// ── 5. Feed mode: which post off the feed to work on next ───────────────────

export interface FeedPickContext {
  /** Rendered "[i] Author (headline): content" lines. */
  listing: string;
  pitchOnJobPosts: boolean;
  northStar?: string;
  targeting?: string;
}

export function buildFeedPickPrompt(ctx: FeedPickContext): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are picking which ONE post off this person's LinkedIn feed to read properly and respond to next. Everything listed is a post they have not engaged with yet.

Priority order:
1. Hiring posts and calls for contractors or referrals${ctx.pitchOnJobPosts ? " — these are the highest value and should almost always win" : ""}.
2. Technical posts and war stories where a working engineer could add a real caveat, mechanism, or counter-example.
3. Opinion posts about the industry with an actual claim in them, where disagreeing would be substantive.
4. Personal news from someone worth being visible to.

Never pick: promotional posts, courses, webinars, lead magnets, engagement bait ("comment YES and I will send it"), politics, reposted motivational quotes, or anything with no claim in it to react to.
${ctx.northStar ? `\nThis person is working towards: ${ctx.northStar}` : ""}${ctx.targeting ? `\nThey want to be visible to: ${ctx.targeting}` : ""}

Reply with ONLY the index number of your pick, or -1 if nothing here is worth their time.`,
    },
    { role: "user", content: ctx.listing },
  ];
}
