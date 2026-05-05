import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import LeadGenCampaign from "@/lib/db/models/lead-gen-campaign";
import User from "@/lib/db/models/user";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { canPerformAction, incrementUsage } from "@/lib/anti-detection/rate-limiter";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { sanitizeForAI } from "@/lib/utils";
import { z } from "zod";
import mongoose from "mongoose";

/**
 * Resolve userId from NextAuth session OR extension x-auth-token header.
 * The extension authenticates with its stored token (the userId).
 */
async function resolveUserId(req: Request): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const token = req.headers.get("x-auth-token");
  if (token && mongoose.Types.ObjectId.isValid(token)) {
    await connectDB();
    const user = await User.exists({ _id: token });
    if (user) return token;
  }
  return null;
}

// ─── Validation schemas ────────────────────────────────────────────────────────

const campaignCreateSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1).max(200)).min(1).max(20),
  commentTemplates: z.array(z.string().min(1).max(1000)).min(1).max(10),
  serviceDescription: z.string().max(500).default(""),
  targetAudience: z.string().max(200).default(""),
  useAI: z.boolean().default(true),
  dailyCommentLimit: z.number().int().min(1).max(15).default(10),
  postsPerKeyword: z.number().int().min(1).max(20).default(5),
});

const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  id: z.string().min(1),
  status: z.enum(["active", "paused", "stopped"]).optional(),
});

const generateCommentSchema = z.object({
  campaignId: z.string().min(1),
  postContent: z.string().min(1).max(3000),
  authorName: z.string().max(200).default(""),
  authorHeadline: z.string().max(300).default(""),
  keyword: z.string().max(200).default(""),
});

const recordCommentSchema = z.object({
  campaignId: z.string().min(1),
  postUrl: z.string().url(),
  postAuthor: z.string().max(200).default(""),
  comment: z.string().min(1).max(1000),
  keyword: z.string().max(200).default(""),
});

// ─── GET: list campaigns ───────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
      }
      const campaign = await LeadGenCampaign.findOne({
        _id: id,
        userId,
      }).lean();

      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      return NextResponse.json({ campaign });
    }

    const campaigns = await LeadGenCampaign.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    // Daily comment usage
    const { current: commentsToday, limit: commentLimit } = await canPerformAction(
      userId,
      "comments"
    );

    return NextResponse.json({ campaigns, commentsToday, commentLimit });
  } catch (err) {
    console.error("[lead-gen GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST: create campaign | generate comment | record comment ─────────────────

export async function POST(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const action = (body?.action as string) || "create";

    await connectDB();

    // ── Classify posts for client intent (filter out service providers) ───────
    if (action === "classify_posts") {
      const classifySchema = z.object({
        campaignId: z.string().min(1),
        posts: z.array(z.object({
          postUrl: z.string(),
          postContent: z.string().max(600),
          authorName: z.string().default(""),
          authorHeadline: z.string().default(""),
        })).max(15),
        keyword: z.string().max(200).default(""),
      });

      const parsed = classifySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
      }

      const { campaignId, posts, keyword } = parsed.data;

      if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
      }

      const campaign = await LeadGenCampaign.findOne({
        _id: campaignId,
        userId,
      }).lean();

      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      const provider = await getUserAIProvider(userId);
      if (!provider || !campaign.useAI) {
        return NextResponse.json({ posts, filtered: false });
      }

      const serviceDesc = sanitizeForAI(campaign.serviceDescription || "web development / website building");

      // Batch classify all posts in a single AI call for efficiency
      const postsForAI = posts.map((p, i) =>
        `[${i}] ${sanitizeForAI(p.authorName)} (${sanitizeForAI(p.authorHeadline).substring(0, 80)}): "${sanitizeForAI(p.postContent).substring(0, 400)}"`
      ).join("\n\n");

      let result = "";
      try {
        result = await provider.generateText(
          [
            {
              role: "system",
              content: `You classify LinkedIn posts to find potential clients for: ${serviceDesc}
Keyword searched: "${sanitizeForAI(keyword)}"
For each numbered post, reply ONLY with the index and Y or N.
Y = person is SEEKING this service (they need it, are looking to hire, asking for help)
N = person is OFFERING this service, sharing expertise, or the post is unrelated
Format exactly: 0:Y, 1:N, 2:Y`,
            },
            { role: "user", content: postsForAI },
          ],
          { temperature: 0, maxTokens: 80 }
        );
      } catch {
        // AI failed — return all posts unfiltered
        return NextResponse.json({ posts, filtered: false });
      }

      const decisionMap = new Map<number, boolean>();
      for (const match of result.matchAll(/(\d+)\s*:\s*([YN])/gi)) {
        decisionMap.set(parseInt(match[1]), match[2].toUpperCase() === "Y");
      }

      const filteredPosts = posts.filter((_, i) => decisionMap.get(i) !== false);
      return NextResponse.json({ posts: filteredPosts, filtered: true });
    }

    // ── Generate AI comment for a given post ──────────────────────────────────
    if (action === "generate_comment") {
      const parsed = generateCommentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { campaignId, postContent, authorName, authorHeadline, keyword } =
        parsed.data;

      if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
      }

      const campaign2 = await LeadGenCampaign.findOne({
        _id: campaignId,
        userId,
      }).lean();

      if (!campaign2) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      // Use AI to generate a personalized comment
      const provider = await getUserAIProvider(userId);
      if (!provider) {
        // Fall back to a random template
        const template = pickTemplate(campaign2.commentTemplates, authorName);
        return NextResponse.json({ comment: template, source: "template" });
      }

      const safePost = sanitizeForAI(postContent);
      const safeHeadline = sanitizeForAI(authorHeadline);
      const safeService = sanitizeForAI(campaign2.serviceDescription);
      const safeAudience = sanitizeForAI(campaign2.targetAudience);

      const systemPrompt = `You are a professional cold-outreach specialist writing LinkedIn comments.
Your goal is to write ONE short, genuine, conversational comment that:
1. Acknowledges the poster's need or problem (don't be generic)
2. Briefly positions your service as a relevant solution
3. Ends with a soft call-to-action or open question
4. Sounds like a real human — NOT a sales pitch, NOT corporate
5. Is 2-4 sentences maximum (under 300 characters ideally)
6. Does NOT use emojis, hashtags, or formal openers like "Great post!"

Service being offered: ${safeService || "web development / website building"}
Target audience: ${safeAudience || "businesses and individuals needing websites"}`;

      const userPrompt = `Post keyword searched: "${keyword}"
Post author: ${authorName}${safeHeadline ? ` (${safeHeadline})` : ""}
Post content: "${safePost}"

Write a personalized, natural comment responding to this post.
Return ONLY the comment text, no quotes, no explanation.`;

      const comment = await provider.generateText(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { temperature: 0.8, maxTokens: 200 }
      );

      return NextResponse.json({ comment: comment.trim(), source: "ai" });
    }

    // ── Record a comment that was posted ──────────────────────────────────────
    if (action === "record_comment") {
      const parsed = recordCommentSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid payload", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { campaignId, postUrl, postAuthor, comment, keyword } = parsed.data;

      if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
      }

      await LeadGenCampaign.findOneAndUpdate(
        { _id: campaignId, userId },
        {
          $inc: { "stats.totalCommented": 1 },
          $set: { "stats.lastRun": new Date() },
          $addToSet: { alreadyCommentedUrls: postUrl },
          $push: {
            recentComments: {
              $each: [{ postUrl, postAuthor, comment, keyword, commentedAt: new Date() }],
              $slice: -50, // Keep last 50 comments
            },
          },
        }
      );

      // Increment daily usage counter
      await incrementUsage(userId, "comments");

      return NextResponse.json({ success: true });
    }

    // ── Create new campaign ───────────────────────────────────────────────────
    const parsed = campaignCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Cap at 5 active campaigns per user
    const existingCount = await LeadGenCampaign.countDocuments({
      userId,
    });
    if (existingCount >= 5) {
      return NextResponse.json(
        { error: "Maximum of 5 campaigns allowed. Delete an existing one first." },
        { status: 400 }
      );
    }

    const campaign = await LeadGenCampaign.create({
      userId,
      ...parsed.data,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    console.error("[lead-gen POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH: update campaign ────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = campaignUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { id, ...updates } = parsed.data;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    // Whitelist of allowed update fields
    const allowedFields = [
      "name",
      "keywords",
      "commentTemplates",
      "serviceDescription",
      "targetAudience",
      "useAI",
      "status",
      "dailyCommentLimit",
      "postsPerKeyword",
    ];

    const safeUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key as keyof typeof updates];
      }
    }

    const campaign = await LeadGenCampaign.findOneAndUpdate(
      { _id: id, userId },
      { $set: safeUpdates },
      { new: true }
    ).lean();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("[lead-gen PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE: remove campaign ───────────────────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await connectDB();

    const result = await LeadGenCampaign.deleteOne({
      _id: id,
      userId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lead-gen DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function pickTemplate(templates: string[], authorName: string): string {
  if (!templates || templates.length === 0) {
    return `Hey${authorName ? ` ${authorName.split(" ")[0]}` : ""}, I saw your post and I can help with that! I build custom websites. Feel free to reach out.`;
  }
  const tpl = templates[Math.floor(Math.random() * templates.length)];
  const firstName = authorName ? authorName.split(" ")[0] : "";
  return tpl
    .replace(/\{authorName\}/g, authorName)
    .replace(/\{firstName\}/g, firstName);
}
