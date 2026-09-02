/**
 * Runtime AI for a task in flight.
 *
 * Some decisions can only be made once the extension is looking at the page —
 * which of the scraped posts is worth engaging with, and what to actually say
 * about it. The extension calls here mid-task so that all judgement stays
 * server-side and the extension remains a thin DOM executor.
 *
 * This endpoint also owns post-level deduplication: it never hands back a post
 * the agent has already acted on.
 *
 * Two sources feed in:
 *   "feed"   — feed mode. No goal required. Classifies the post and writes to
 *              it in one call, pitching on hiring posts.
 *   "search" — strategist mode. Keyword search results, judged against a goal.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db/connection";
import { resolveRequestUserId } from "@/lib/utils/get-actor-id";
import AgentTask from "@/lib/db/models/agent-task";
import AgentGoal from "@/lib/db/models/agent-goal";
import AgentCycle from "@/lib/db/models/agent-cycle";
import ActivityLog from "@/lib/db/models/activity-log";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { sanitizeForAI } from "@/lib/utils";
import { recallBlock } from "@/lib/autopilot/memory";
import { buildPersonaSnapshot, resolvePortfolioUrl } from "@/lib/autopilot/persona";
import {
  personaBlock,
  buildFeedPickPrompt,
  buildFeedCommentPrompt,
  type FeedCommentResult,
} from "@/lib/ai/prompts/autopilot";
import { applyRandomSkipping } from "@/lib/anti-detection/patterns";
import AgentConfig, { DEFAULT_FEED_SETTINGS } from "@/lib/db/models/agent-config";
import { checkBudget, economyModel } from "@/lib/autopilot/ai-budget";
import { buildAIMetadata, saveAIUsageLog } from "@/lib/ai/usage-history";
import {
  appendPortfolio,
  polishComment,
  rejectReason,
} from "@/lib/autopilot/comment-quality";
import { captureHiringPost } from "@/lib/outreach/capture";

const postSchema = z.object({
  /**
   * How the extension will find this card again on the page it scraped it
   * from. LinkedIn's redesigned feed renders no urn and often no permalink, so
   * this — not the URL — is the identity that survives the round trip.
   */
  postKey: z.string().max(600).default(""),
  postUrl: z.string().max(600),
  postContent: z.string().max(4000).default(""),
  authorName: z.string().max(200).default(""),
  authorHeadline: z.string().max(400).default(""),
  /**
   * Anchors scraped out of the post body — mailto: addresses and outbound
   * links. This is how a hiring post's application route reaches the server:
   * the visible text of a LinkedIn link is often truncated while the href is
   * whole.
   */
  postLinks: z
    .array(
      z.object({
        href: z.string().max(600),
        text: z.string().max(200).optional(),
      })
    )
    .max(12)
    .default([]),
});

const bodySchema = z.object({
  taskId: z.string().length(24),
  action: z.enum(["pick_post", "unseen_posts", "comment"]),
  /** Where the posts came from. Selects which brain judges them. */
  source: z.enum(["feed", "search"]).default("search"),
  /** Feed mode only — mirrors config.feed.pitchOnJobPosts. */
  pitchOnJobPosts: z.boolean().default(true),
  /**
   * Feed mode only. Write a comment for this post whatever it is, instead of
   * letting the model decline. Feed mode is coverage: the user asked for every
   * post on the feed to be engaged with, not for the agent to curate.
   */
  force: z.boolean().default(false),
  /** unseen_posts only — how many to hand back. 0 means all of them. */
  limit: z.number().int().min(0).max(60).default(5),
  posts: z.array(postSchema).max(60).optional(),
  post: postSchema.optional(),
});

/** Normalised post URL — LinkedIn appends tracking params that break equality. */
function normaliseUrl(url: string): string {
  return url.split("?")[0].replace(/\/$/, "");
}

export async function POST(req: Request) {
  try {
    const userId = await resolveRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await connectDB();

    const task = await AgentTask.findOne({ _id: parsed.data.taskId, userId });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { action, source, pitchOnJobPosts, force, limit } = parsed.data;

    if (action === "unseen_posts") {
      return unseenPosts(userId, parsed.data.posts ?? [], limit, parsed.data.taskId);
    }

    if (action === "pick_post") {
      return pickPost(userId, parsed.data.posts ?? [], source, pitchOnJobPosts);
    }

    return source === "feed"
      ? feedComment(userId, parsed.data.post, pitchOnJobPosts, force, parsed.data.taskId)
      : generateComment(userId, parsed.data.post);
  } catch (error) {
    console.error("[Autopilot/Generate] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Feed mode: which of these have I not been through yet? ──────────────────

/**
 * Filter a feed sweep down to the posts the agent has not already acted on,
 * in the order the feed showed them.
 *
 * No AI and no sampling. Feed mode's whole job is to work down the feed, so
 * the only reason to leave a post out is that it has already been engaged
 * with — which only the server knows, because only the server has the history.
 *
 * Dedupe is by `postKey`, falling back to the URL. The redesigned feed renders
 * neither a urn nor a permalink on most cards, so the extension sends a
 * content fingerprint instead and it is that string which gets recorded
 * against the activity log.
 */
async function unseenPosts(
  userId: string,
  posts: z.infer<typeof postSchema>[],
  limit: number,
  taskId?: string
): Promise<NextResponse> {
  if (posts.length === 0) {
    return NextResponse.json({ posts: [], reason: "No posts scraped" });
  }

  const keyOf = (p: { postKey?: string; postUrl: string }) =>
    normaliseUrl(p.postKey || p.postUrl);

  const keys = posts.map(keyOf);
  const seen = await ActivityLog.find({
    userId,
    module: "autopilot",
    linkedinUrl: { $in: keys },
  })
    .select("linkedinUrl")
    .lean();

  const seenSet = new Set(seen.map((s) => normaliseUrl(s.linkedinUrl || "")));
  const fresh = posts.filter((p) => !seenSet.has(keyOf(p)));

  // Every post the agent reads is checked for being a job opening, here rather
  // than in the comment step, because a like-only pass and a spent AI budget
  // both skip that step — and an opening with an address on it is worth more
  // than the comment would have been. Detection is pure text matching, so a
  // post that is not an opening costs nothing.
  await captureOpenings(userId, fresh, taskId);

  return NextResponse.json({
    // limit 0 is an uncapped pass asking for everything the feed has left.
    posts: limit > 0 ? fresh.slice(0, limit) : fresh,
    total: fresh.length,
  });
}

/**
 * Record any openings among these posts, without ever failing the caller.
 *
 * The sweep's job is engagement; capture is a bonus on top of it. A capture
 * that throws (a duplicate key, a Mongo hiccup) must not cost the extension the
 * freshness answer it actually asked for.
 */
async function captureOpenings(
  userId: string,
  posts: z.infer<typeof postSchema>[],
  taskId?: string,
  aiPostType?: string
): Promise<void> {
  const results = await Promise.allSettled(
    posts.slice(0, 20).map((post) =>
      captureHiringPost({
        userId,
        taskId,
        aiPostType,
        post: {
          postKey: post.postKey || post.postUrl,
          postUrl: post.postUrl,
          postContent: post.postContent,
          authorName: post.authorName,
          authorHeadline: post.authorHeadline,
          postLinks: post.postLinks,
        },
      })
    )
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Autopilot/Generate] Hiring capture failed:", result.reason);
    }
  }
}

// ── Pick a post worth engaging with ─────────────────────────────────────────

async function pickPost(
  userId: string,
  posts: z.infer<typeof postSchema>[],
  source: "feed" | "search",
  pitchOnJobPosts: boolean
): Promise<NextResponse> {
  if (posts.length === 0) {
    return NextResponse.json({ post: null, reason: "No posts scraped" });
  }

  // Never touch a post the agent has already acted on.
  const urls = posts.map((p) => normaliseUrl(p.postUrl));
  const seen = await ActivityLog.find({
    userId,
    module: "autopilot",
    linkedinUrl: { $in: urls },
  })
    .select("linkedinUrl")
    .lean();

  const seenSet = new Set(seen.map((s) => normaliseUrl(s.linkedinUrl || "")));
  let fresh = posts.filter((p) => !seenSet.has(normaliseUrl(p.postUrl)));

  if (fresh.length === 0) {
    return NextResponse.json({
      post: null,
      reason:
        source === "feed"
          ? "I have already been through everything currently on the feed"
          : "Every post here was already engaged with",
    });
  }

  // Humans do not act on everything they scroll past. Skipping at random is a
  // cheap, meaningful difference between this and an obvious bot. Feed mode
  // skips far less: the intent there is to work the whole feed, and anything
  // passed over comes back around on the next sweep anyway.
  const sampled = applyRandomSkipping(fresh, source === "feed" ? 0.08 : 0.2);
  if (sampled.length > 0) fresh = sampled;

  const [goal, provider] = await Promise.all([
    AgentGoal.findOne({ userId }).lean(),
    getUserAIProvider(userId),
  ]);

  // Feed mode has no goal to judge against, so only the provider is required.
  if (!provider || (source === "search" && !goal)) {
    return NextResponse.json({
      post: fresh[0],
      reason: "No AI available — took the first unseen post",
    });
  }

  const listing = fresh
    .map(
      (p, i) =>
        `[${i}] ${sanitizeForAI(p.authorName)} (${sanitizeForAI(p.authorHeadline).slice(0, 100)}): "${sanitizeForAI(p.postContent).slice(0, 350)}"`
    )
    .join("\n\n");

  const messages =
    source === "feed"
      ? buildFeedPickPrompt({
          listing,
          pitchOnJobPosts,
          northStar: goal ? sanitizeForAI(goal.northStar) : undefined,
          targeting: goal
            ? sanitizeForAI((goal.constraints?.targetRoles || []).join(", "))
            : undefined,
        })
      : [
          {
            role: "system" as const,
            content: `You pick which ONE LinkedIn post is worth a thoughtful comment from this person, to advance this goal:
${sanitizeForAI(goal!.northStar)}

They are targeting: ${sanitizeForAI((goal!.constraints?.targetRoles || []).join(", ") || "decision-makers")} in ${sanitizeForAI((goal!.constraints?.niche || []).join(", ") || "their niche")}.

Pick the post where THIS person can add something genuinely useful from their own experience, and where the author is someone worth being visible to.
Prefer posts by founders, hiring managers and operators over posts by other job seekers or agencies.
Skip anything political, promotional, or where they have nothing real to add.

Reply with ONLY the index number, or -1 if none is worth commenting on.`,
          },
          { role: "user" as const, content: listing },
        ];

  let answer = "";
  try {
    answer = await provider.generateText(messages, { temperature: 0.2, maxTokens: 10 });
  } catch {
    return NextResponse.json({
      post: fresh[0],
      reason: "Selection AI failed — took the first unseen post",
    });
  }

  const index = parseInt((answer.match(/-?\d+/) || ["-1"])[0], 10);
  if (index < 0 || index >= fresh.length) {
    return NextResponse.json({ post: null, reason: "Nothing here was worth commenting on" });
  }

  return NextResponse.json({ post: fresh[index], reason: "Selected as the best fit" });
}

// ── Feed mode: classify and write in one call ───────────────────────────────

async function feedComment(
  userId: string,
  post: z.infer<typeof postSchema> | undefined,
  pitchOnJobPosts: boolean,
  force = false,
  taskId?: string
): Promise<NextResponse> {
  if (!post) {
    return NextResponse.json({ error: "No post provided" }, { status: 400 });
  }

  const provider = await getUserAIProvider(userId);
  if (!provider) {
    return NextResponse.json(
      { error: "No AI provider configured — add an API key in Settings" },
      { status: 400 }
    );
  }

  const config = await AgentConfig.findOne({ userId }).lean();
  const feed = { ...DEFAULT_FEED_SETTINGS, ...(config?.feed ?? {}) };

  // Checked before anything is generated. An uncapped feed pass makes one call
  // per post from the moment it starts, so the only useful place to stop is
  // before the call, not after the bill.
  const budget = await checkBudget(
    userId,
    { maxCalls: feed.dailyAiCalls, maxCostUsd: feed.dailyAiSpendUsd },
    config?.workingHours?.timezone || "UTC"
  );
  if (!budget.allowed) {
    return NextResponse.json({ skip: true, budgetSpent: true, reason: budget.reason });
  }

  // A feed comment is a short, tightly specified writing task. Paying frontier
  // rates for it, once per post, all day, is the single largest avoidable cost.
  const model = feed.economyMode ? economyModel(provider.name) : undefined;

  // Feed mode runs without a goal. If one happens to exist (the user has also
  // used strategist mode) its persona and north star are better context than
  // rebuilding from the career profile, so prefer it.
  const goal = await AgentGoal.findOne({ userId }).lean();
  const [persona, memories] = await Promise.all([
    goal?.personaSnapshot
      ? Promise.resolve(goal.personaSnapshot)
      : buildPersonaSnapshot(userId),
    // Four is enough to steer the voice. Every extra memory is tokens on every
    // post for the rest of the day.
    recallBlock(userId, { kinds: ["pattern", "insight"], limit: 4 }),
  ]);

  // Without real projects the agent can only produce the generic slop the whole
  // design exists to avoid, and a pitch would be outright fabrication.
  if (!persona.signatureProjects?.length && !persona.summary) {
    return NextResponse.json(
      {
        error:
          "Your career profile is empty, so I have nothing real to comment from. Fill in your projects and experience first.",
      },
      { status: 400 }
    );
  }

  const write = async (mustEngage: boolean, temperature: number) => {
    const result = await provider.generateJSON<FeedCommentResult>(
      buildFeedCommentPrompt({
        persona,
        memories,
        northStar: goal ? sanitizeForAI(goal.northStar) : undefined,
        pitchOnJobPosts,
        mustEngage,
        post: {
          authorName: sanitizeForAI(post.authorName),
          authorHeadline: sanitizeForAI(post.authorHeadline),
          // A LinkedIn post makes its point in the first few lines. The tail is
          // hashtags and sign-off, and it was costing ~325 tokens on every call.
          postContent: sanitizeForAI(post.postContent).slice(0, 1200),
        },
      }),
      // A three-sentence comment plus a one-line angle needs nowhere near the
      // old ceiling; this only caps a runaway generation.
      { temperature, maxTokens: 300, model }
    );

    // Logged per call, not per post, so retries are counted against the day's
    // allowance the same as first attempts.
    await saveAIUsageLog({
      userId,
      isGuest: false,
      endpoint: "/api/autopilot/generate",
      metadata: buildAIMetadata(provider),
    });

    return result;
  };

  let generated: FeedCommentResult;
  try {
    generated = await write(force, 0.8);
  } catch (error) {
    return NextResponse.json(
      { error: `Comment generation failed: ${(error as Error).message}` },
      { status: 502 }
    );
  }

  const postType = generated.postType || "opinion";

  // The model has now read the whole post with context, so its verdict is
  // better than the text match made when the post was first seen. Re-running
  // capture upgrades a post that only looked borderline; the unique index
  // makes a second call on an already-recorded post a no-op.
  await captureOpenings(userId, [post], taskId, postType);
  // A pitch is allowed to be longer, so it gets a higher floor too.
  const isPitch = postType === "hiring" && pitchOnJobPosts;
  const quality = {
    minLength: isPitch ? 40 : 15,
    // On a promotion, a new role or a launch, congratulating them is the right
    // move and the model will do it unprompted. Rejecting that outright is what
    // left personal news liked but never commented on.
    allowCongratulation: postType === "personal_news",
  };

  // The model decided there was nothing worth saying. Normally that is a valid
  // outcome, not an error — 200 so the extension records a clean skip rather
  // than a failure that burns a retry. Under `force` it is overridden: feed
  // mode is coverage, and the user asked for every post to get a response.
  if (generated.engage === false && !force) {
    return NextResponse.json({
      skip: true,
      postType,
      reason: generated.skipReason || `Nothing worth adding to a ${postType} post`,
    });
  }

  let comment = polishComment(generated.comment || "");
  let problem = rejectReason(comment, quality);

  // Under `force`, a draft that fails the quality gate gets ONE more attempt,
  // hotter — the failure being worked around is almost always the model
  // settling into the same safe, generic phrasing it was just told not to use.
  // A second retry roughly never rescued a post that the first did not, and it
  // put a third call on the bill for every awkward post on the feed.
  if (force && problem) {
    let best = comment;
    for (const temperature of [1]) {
      let retry: FeedCommentResult;
      try {
        retry = await write(true, temperature);
      } catch {
        break;
      }

      const candidate = polishComment(retry.comment || "");
      const candidateProblem = rejectReason(candidate, quality);
      if (!candidateProblem) {
        comment = candidate;
        problem = null;
        break;
      }
      // Keep the longest thing said so far: length is a rough proxy for having
      // said something, and a flawed real comment beats no comment at all when
      // the user has asked for every post to get one.
      if (candidate.length > best.length) best = candidate;
    }

    if (problem && best.length >= quality.minLength) {
      comment = best;
      problem = null;
    }
  }

  if (problem) {
    return NextResponse.json({
      skip: true,
      postType,
      reason: `The comment I wrote ${problem}, so I said nothing instead`,
    });
  }

  // Trim before the link goes on, so truncation can never cut the URL in half.
  let finalComment = comment.slice(0, isPitch ? 620 : 400);

  // A hiring post is the one place a link belongs: the author asked for people,
  // and the pitch is only as good as what it points at.
  if (isPitch) {
    // A snapshot frozen before the field existed carries no link, so fall back
    // to the profile itself. Only read on a hiring post, where it is used.
    const portfolio = persona.portfolioUrl || (await resolvePortfolioUrl(userId));
    finalComment = appendPortfolio(finalComment, portfolio);
  }

  return NextResponse.json({
    comment: finalComment,
    postType,
    angle: (generated.angle || "").slice(0, 300),
    isPitch,
  });
}

// ── Strategist mode: write the comment against the goal ─────────────────────

async function generateComment(
  userId: string,
  post?: z.infer<typeof postSchema>
): Promise<NextResponse> {
  if (!post) {
    return NextResponse.json({ error: "No post provided" }, { status: 400 });
  }

  const [goal, cycle, provider] = await Promise.all([
    AgentGoal.findOne({ userId }).lean(),
    AgentCycle.findOne({ userId, status: "running" }).lean(),
    getUserAIProvider(userId),
  ]);

  if (!provider || !goal) {
    return NextResponse.json(
      { error: "Cannot write a comment without an AI provider and a goal" },
      { status: 400 }
    );
  }

  const memories = await recallBlock(userId, { kinds: ["pattern", "insight"], limit: 8 });

  let comment = "";
  try {
    comment = await provider.generateText(
      [
        {
          role: "system",
          content: `You are writing a LinkedIn comment AS the person described below. Not about them — as them.

WHO YOU ARE
${personaBlock(goal.personaSnapshot)}

WHY YOU ARE COMMENTING
${sanitizeForAI(goal.northStar)}
${cycle?.strategy ? `This week's focus: ${sanitizeForAI(cycle.strategy)}` : ""}

WHAT YOU HAVE LEARNED ABOUT WHAT WORKS
${memories}

RULES — these are absolute:
- 1 to 3 sentences. Under 300 characters. Longer reads as a pitch.
- Say something only THIS person could say, drawn from the real projects listed above. If you cannot, ask one genuinely curious, specific question about their post instead.
- Never open with "Great post", "Love this", "Thanks for sharing", "Couldn't agree more", or any variant.
- Never pitch, never mention that you are available, never include a link, never use hashtags.
- Never claim experience, a client, a company, or a technology that is not listed above.
- No em dashes. No emoji. Write the way a competent engineer types in a hurry — plain and direct.
- Do not restate what the post already said back at the author.

Reply with the comment text and nothing else. No quotes, no preamble.`,
        },
        {
          role: "user",
          content: `Post by ${sanitizeForAI(post.authorName)} (${sanitizeForAI(post.authorHeadline)}):

"${sanitizeForAI(post.postContent).slice(0, 1200)}"

Write the comment.`,
        },
      ],
      { temperature: 0.75, maxTokens: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Comment generation failed: ${(error as Error).message}` },
      { status: 502 }
    );
  }

  comment = polishComment(comment).slice(0, 600);

  // A model that ignored the rules and produced boilerplate is worse than
  // posting nothing — the whole point is not sounding like a bot.
  const problem = rejectReason(comment);
  if (problem) {
    return NextResponse.json(
      { error: `Generated comment ${problem} — skipping this post` },
      { status: 422 }
    );
  }

  return NextResponse.json({ comment });
}
