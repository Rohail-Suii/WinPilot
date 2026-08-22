import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import JobSearch from "@/lib/db/models/job-search";
import JobApplication from "@/lib/db/models/job-application";
import type { ApplicationStatus } from "@/lib/db/models/job-application";
import { jobSearchSchema } from "@/lib/validators";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeForAI } from "@/lib/utils";
import { getActorId } from "@/lib/utils/get-actor-id";

export async function GET(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "searches";

    await connectDB();

    if (view === "applications") {
      const status = searchParams.get("status");
      const search = searchParams.get("search")?.trim();
      const cursor = searchParams.get("cursor"); // cursor-based pagination
      const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
      const filter: Record<string, unknown> = { userId: userId };

      const validStatuses = ["found", "tailoring", "applying", "applied", "failed", "skipped", "interview", "rejected", "offered"];
      if (status && !validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (status) filter.status = status;

      // Text search on jobTitle and company
      if (search && search.length <= 100) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
          { jobTitle: { $regex: escaped, $options: "i" } },
          { company: { $regex: escaped, $options: "i" } },
        ];
      }

      if (cursor) {
        if (!mongoose.Types.ObjectId.isValid(cursor)) {
          return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
        }
        filter._id = { $lt: cursor };
      }

      // Lightweight projection: exclude jobDescription from list
      const projection = {
        jobTitle: 1,
        company: 1,
        location: 1,
        jobUrl: 1,
        status: 1,
        matchScore: 1,
        matchBreakdown: 1,
        appliedAt: 1,
        notes: 1,
        tailoredResume: 1,
        formAnswers: 1,
        createdAt: 1,
        updatedAt: 1,
      };

      const [applications, total] = await Promise.all([
        JobApplication.find(filter, projection)
          .sort({ _id: -1 })
          .limit(limit + 1)
          .lean(),
        JobApplication.countDocuments(filter),
      ]);

      const hasMore = applications.length > limit;
      const results = hasMore ? applications.slice(0, limit) : applications;
      const nextCursor = hasMore ? results[results.length - 1]._id : null;

      return NextResponse.json({ applications: results, nextCursor, hasMore, total });
    }

    if (view === "stats") {
      const { getApplicationStats } = await import("@/lib/services/job-analysis");
      const stats = await getApplicationStats(userId);
      return NextResponse.json({ stats });
    }

    const searches = await JobSearch.find({ userId: userId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ searches });
  } catch (error) {
    console.error("[Jobs] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const body = await req.json();

    await connectDB();

    // Create a new job search config
    if (!action) {
      const parsed = jobSearchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
      }
      const search = await JobSearch.create({ ...parsed.data, userId: userId });
      return NextResponse.json({ search }, { status: 201 });
    }

    // Process discovered jobs from extension
    if (action === "discover") {
      const { jobs, jobSearchId, minMatchScore } = body;
      if (!jobs?.length || !jobSearchId) {
        return NextResponse.json({ error: "Jobs array and jobSearchId are required" }, { status: 400 });
      }
      try {
        const { processDiscoveredJobs } = await import("@/lib/services/job-analysis");
        const result = await processDiscoveredJobs(
          userId,
          jobs,
          jobSearchId,
          minMatchScore ?? 60
        );
        return NextResponse.json({ result });
      } catch (error) {
        console.error("[Jobs] Failed to process discovered jobs:", error);
        const message = error instanceof Error ? error.message : "Failed to process jobs";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    // Prepare a job for application (tailor resume)
    if (action === "prepare") {
      const { applicationId } = body;
      if (!applicationId) {
        return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
      }
      const { prepareJobApplication } = await import("@/lib/services/job-analysis");
      const result = await prepareJobApplication(userId, applicationId);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // Mark application as completed
    if (action === "complete") {
      const { applicationId, success, notes } = body;
      if (!applicationId || typeof success !== "boolean") {
        return NextResponse.json({ error: "applicationId and success are required" }, { status: 400 });
      }
      const { completeApplication } = await import("@/lib/services/job-analysis");
      await completeApplication(userId, applicationId, success, notes);
      return NextResponse.json({ success: true });
    }

    // Update application status
    if (action === "status") {
      const { applicationId, status, notes } = body;
      if (!applicationId || !status) {
        return NextResponse.json({ error: "applicationId and status are required" }, { status: 400 });
      }
      const { updateApplicationStatus } = await import("@/lib/services/job-analysis");
      await updateApplicationStatus(
        userId,
        applicationId,
        status as ApplicationStatus,
        notes
      );
      return NextResponse.json({ success: true });
    }

    // Answer form questions
    if (action === "answer-form") {
      const { questions, userPreferences } = body;
      if (!questions?.length) {
        return NextResponse.json({ error: "Questions array is required" }, { status: 400 });
      }
      const sanitizedQuestions = questions.map((q: { text: string; type: string; options?: string[] }) => ({
        ...q,
        text: sanitizeForAI(q.text),
      }));

      try {
        const { answerFormQuestions } = await import("@/lib/services/form-answerer");
        const answers = await answerFormQuestions(userId, sanitizedQuestions, userPreferences);
        return NextResponse.json({ answers });
      } catch (error) {
        console.error("[Jobs] Failed to answer form questions:", error);
        const message = error instanceof Error ? error.message : "Failed to answer questions";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[Jobs] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = jobSearchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();
    const search = await JobSearch.findOneAndUpdate(
      { _id: id, userId: userId },
      { $set: parsed.data },
      { new: true }
    ).lean();
    if (!search) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ search });
  } catch (error) {
    console.error("[Jobs] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId } = actor;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await connectDB();
    const search = await JobSearch.findOneAndDelete({ _id: id, userId: userId });
    if (!search) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Jobs] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

