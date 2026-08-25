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
