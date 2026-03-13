import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import HeroProfile from "@/lib/db/models/hero-profile";
import Post from "@/lib/db/models/post";
import ActivityLog from "@/lib/db/models/activity-log";
import { heroProfileSchema } from "@/lib/validators";
import { canPerformAction, incrementUsage } from "@/lib/anti-detection/rate-limiter";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeForAI } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "profile";

    await connectDB();

    if (view === "posts") {
      const status = searchParams.get("status");
      const filter: Record<string, unknown> = { userId: session.user.id };
      if (status) filter.status = status;

      const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(50).lean();
      return NextResponse.json({ posts });
    }

    if (view === "stats") {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [totalPosts, thisWeek, thisMonth, engagementStats] = await Promise.all([
        Post.countDocuments({ userId: session.user.id }),
        Post.countDocuments({ userId: session.user.id, createdAt: { $gte: weekAgo } }),
        Post.countDocuments({ userId: session.user.id, createdAt: { $gte: monthAgo } }),
        Post.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(session.user.id), status: "posted" } },
          {
            $group: {
              _id: null,
              totalViews: { $sum: "$engagement.views" },
              totalLikes: { $sum: "$engagement.likes" },
              totalComments: { $sum: "$engagement.comments" },
              totalShares: { $sum: "$engagement.shares" },
              avgViews: { $avg: "$engagement.views" },
            },
          },
        ]),
      ]);

      return NextResponse.json({
        stats: {
          totalPosts,
          thisWeek,
          thisMonth,
          engagement: engagementStats[0] || {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            avgViews: 0,
          },
        },
      });
    }

    if (view === "scheduled") {
      const scheduled = await Post.find({
        userId: session.user.id,
        status: "scheduled",
        scheduledFor: { $gte: new Date() },
      })
        .sort({ scheduledFor: 1 })
        .lean();
      return NextResponse.json({ posts: scheduled });
    }

    const profile = await HeroProfile.findOne({ userId: session.user.id }).lean();
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[Hero] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    await connectDB();

    // Create/update hero profile
    if (action === "profile") {
      const parsed = heroProfileSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }

      const profile = await HeroProfile.findOneAndUpdate(
        { userId: session.user.id },
        { ...parsed.data, userId: session.user.id },
        { upsert: true, returnDocument: "after" }
      );
      return NextResponse.json({ profile });
    }

    // Generate AI content
    if (action === "generate") {
      const { topic } = body;
      const sanitizedTopic = sanitizeForAI(topic || "Create a post based on my content pillars");
      const profile = await HeroProfile.findOne({ userId: session.user.id }).lean();
      if (!profile) {
        return NextResponse.json({ error: "Set up your hero profile first" }, { status: 400 });
      }

      const { getUserAIProvider } = await import("@/lib/ai/key-manager");
      const ai = await getUserAIProvider(session.user.id);
      if (!ai) {
        return NextResponse.json({ error: "No AI API key configured" }, { status: 400 });
      }

      try {
        const { buildLinkedInPostPrompt } = await import("@/lib/ai/prompts");
        const messages = buildLinkedInPostPrompt(
          sanitizedTopic,
          profile.niche,
          profile.targetAudience,
          profile.voiceTone,
          profile.contentPillars
        );
        const result = await ai.generateJSON<{
          content: string;
          hashtags: string[];
          estimatedEngagement: string;
          postType: string;
          hookLine: string;
        }>(messages);

        return NextResponse.json({ generated: result });
      } catch (error) {
        console.error("[Hero] AI generation failed:", error);
        const message = error instanceof Error ? error.message : "AI generation failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Generate AI comment
    if (action === "generate-comment") {
      const { postContent } = body;
      if (!postContent) {
        return NextResponse.json({ error: "Post content is required" }, { status: 400 });
      }

      const sanitizedContent = sanitizeForAI(postContent);

      const profile = await HeroProfile.findOne({ userId: session.user.id }).lean();
      const { getUserAIProvider } = await import("@/lib/ai/key-manager");
      const ai = await getUserAIProvider(session.user.id);
      if (!ai) {
        return NextResponse.json({ error: "No AI API key configured" }, { status: 400 });
      }

      try {
        const { buildLinkedInCommentPrompt } = await import("@/lib/ai/prompts");
        const messages = buildLinkedInCommentPrompt(
          sanitizedContent,
          profile?.niche || "general",
          profile?.voiceTone || "professional"
        );
        const result = await ai.generateJSON<{ comment: string; type: string }>(messages);
        return NextResponse.json({ generated: result });
      } catch (error) {
        console.error("[Hero] AI comment generation failed:", error);
        const message = error instanceof Error ? error.message : "AI generation failed";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Create a post
    if (action === "post") {
      const { content, type, hashtags, scheduledFor, targetGroups } = body;
      if (!content) {
        return NextResponse.json({ error: "Content is required" }, { status: 400 });
      }

      const sanitizedPostContent = sanitizeForAI(content);

      // Check rate limits for posts
      const { allowed } = await canPerformAction(session.user.id, "posts");
      if (!allowed && !scheduledFor) {
        return NextResponse.json({ error: "Daily post limit reached" }, { status: 429 });
      }

      const profile = await HeroProfile.findOne({ userId: session.user.id }).lean();

      const post = await Post.create({
        userId: session.user.id,
        heroProfileId: profile?._id,
        content: sanitizedPostContent,
        type: type || "text",
        hashtags: hashtags || [],
        targetGroups: targetGroups || [],
        status: scheduledFor ? "scheduled" : "draft",
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      });

      return NextResponse.json({ post }, { status: 201 });
    }

    // Mark post as posted (from extension)
    if (action === "posted") {
      const { postId, linkedinPostUrl } = body;
      if (!postId) {
        return NextResponse.json({ error: "postId is required" }, { status: 400 });
      }

      const post = await Post.findOneAndUpdate(
        { _id: postId, userId: session.user.id },
        { status: "posted", postedAt: new Date(), linkedinPostUrl },
        { returnDocument: "after" }
      );

      if (post) {
        await incrementUsage(session.user.id, "posts");
        await ActivityLog.create({
          userId: session.user.id,
          action: "post_published",
          module: "hero",
          details: { postId, linkedinPostUrl },
          status: "success",
          timestamp: new Date(),
        });
      }

      return NextResponse.json({ post });
    }

    // Update engagement stats
    if (action === "engagement") {
      const { postId, engagement } = body;
      if (!postId) {
        return NextResponse.json({ error: "postId is required" }, { status: 400 });
      }

      const post = await Post.findOneAndUpdate(
        { _id: postId, userId: session.user.id },
        { $set: { engagement } },
        { returnDocument: "after" }
      );
      return NextResponse.json({ post });
    }

    // Manage groups
    if (action === "groups") {
      const { groups } = body;
      if (!groups?.length) {
        return NextResponse.json({ error: "Groups data is required" }, { status: 400 });
      }

      const profile = await HeroProfile.findOneAndUpdate(
        { userId: session.user.id },
        { $set: { groups } },
        { returnDocument: "after" }
      );
      return NextResponse.json({ profile });
    }

    // Add to content queue
    if (action === "queue") {
      const { content: queueContent, scheduledFor: queueDate } = body;
      if (!queueContent) {
        return NextResponse.json({ error: "Content is required" }, { status: 400 });
      }

      const profile = await HeroProfile.findOneAndUpdate(
        { userId: session.user.id },
        {
          $push: {
            contentQueue: {
              content: queueContent,
              scheduledFor: queueDate ? new Date(queueDate) : undefined,
              status: queueDate ? "scheduled" : "draft",
            },
          },
        },
        { returnDocument: "after" }
      );
      return NextResponse.json({ profile });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Hero] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
    }

    const body = await req.json();
    await connectDB();

    // Whitelist allowed fields to prevent mass assignment
    const ALLOWED_FIELDS = ["content", "type", "hashtags", "targetGroups", "status", "scheduledFor"];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const post = await Post.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: updates },
      { returnDocument: "after" }
    );

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error("[Hero] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "post";

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await connectDB();

    if (type === "post") {
      await Post.findOneAndDelete({ _id: id, userId: session.user.id });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hero] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

