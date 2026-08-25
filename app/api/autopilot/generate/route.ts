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
import { personaBlock } from "@/lib/ai/prompts/autopilot";
import { applyRandomSkipping } from "@/lib/anti-detection/patterns";

const postSchema = z.object({
  postUrl: z.string().max(600),
  postContent: z.string().max(2000).default(""),
  authorName: z.string().max(200).default(""),
  authorHeadline: z.string().max(400).default(""),
});

const bodySchema = z.object({
  taskId: z.string().length(24),
  action: z.enum(["pick_post", "comment"]),
  posts: z.array(postSchema).max(20).optional(),
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

    if (parsed.data.action === "pick_post") {
      return pickPost(userId, parsed.data.posts ?? []);
    }

    return generateComment(userId, parsed.data.post);
  } catch (error) {
    console.error("[Autopilot/Generate] Failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Pick a post worth engaging with ─────────────────────────────────────────

async function pickPost(
  userId: string,
  posts: z.infer<typeof postSchema>[]
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
    return NextResponse.json({ post: null, reason: "Every post here was already engaged with" });
  }

  // Humans do not act on everything they scroll past. Skipping ~20% at random
  // is a cheap, meaningful difference between this and an obvious bot.
  const sampled = applyRandomSkipping(fresh, 0.2);
  if (sampled.length > 0) fresh = sampled;

  const goal = await AgentGoal.findOne({ userId }).lean();
  const provider = await getUserAIProvider(userId);

  if (!provider || !goal) {
    return NextResponse.json({ post: fresh[0], reason: "No AI available — took the first unseen post" });
  }

  const listing = fresh
    .map(
      (p, i) =>
        `[${i}] ${sanitizeForAI(p.authorName)} (${sanitizeForAI(p.authorHeadline).slice(0, 100)}): "${sanitizeForAI(p.postContent).slice(0, 350)}"`
    )
    .join("\n\n");

  let answer = "";
  try {
    answer = await provider.generateText(
      [
        {
          role: "system",
          content: `You pick which ONE LinkedIn post is worth a thoughtful comment from this person, to advance this goal:
${sanitizeForAI(goal.northStar)}

They are targeting: ${sanitizeForAI((goal.constraints?.targetRoles || []).join(", ") || "decision-makers")} in ${sanitizeForAI((goal.constraints?.niche || []).join(", ") || "their niche")}.

Pick the post where THIS person can add something genuinely useful from their own experience, and where the author is someone worth being visible to.
Prefer posts by founders, hiring managers and operators over posts by other job seekers or agencies.
Skip anything political, promotional, or where they have nothing real to add.

Reply with ONLY the index number, or -1 if none is worth commenting on.`,
        },
        { role: "user", content: listing },
      ],
      { temperature: 0.2, maxTokens: 10 }
    );
  } catch {
    return NextResponse.json({ post: fresh[0], reason: "Selection AI failed — took the first unseen post" });
  }

  const index = parseInt((answer.match(/-?\d+/) || ["-1"])[0], 10);
  if (index < 0 || index >= fresh.length) {
    return NextResponse.json({ post: null, reason: "Nothing here was worth commenting on" });
  }

  return NextResponse.json({ post: fresh[index], reason: "Selected as the best fit for the goal" });
}

// ── Write the comment ───────────────────────────────────────────────────────

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

  comment = comment.trim().replace(/^["']|["']$/g, "").slice(0, 600);

  // A model that ignored the rules and produced boilerplate is worse than
  // posting nothing — the whole point is not sounding like a bot.
  const banned = /^(great post|love this|thanks for sharing|couldn'?t agree more|so true|well said|100%)/i;
  if (!comment || comment.length < 15 || banned.test(comment)) {
    return NextResponse.json(
      { error: "Generated comment was generic or empty — skipping this post" },
      { status: 422 }
    );
  }

  return NextResponse.json({ comment });
}
