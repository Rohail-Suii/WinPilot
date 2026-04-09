/**
 * Job Automation API
 * Server-side orchestrator that drives the full automation flow:
 *   1. Tell extension to navigate to LinkedIn job search
 *   2. Scrape discovered jobs
 *   3. Score & filter jobs via AI
 *   4. For each qualifying job: tailor resume -> generate PDF -> fill form -> apply
 *
 * The extension calls this API at each step to get the next instruction.
 * This keeps all intelligence server-side; the extension is a thin DOM executor.
 */

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db/connection";
import JobSearch from "@/lib/db/models/job-search";
import JobApplication from "@/lib/db/models/job-application";
import User from "@/lib/db/models/user";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { processDiscoveredJobs, prepareJobApplication, completeApplication } from "@/lib/services/job-analysis";
import { answerFormQuestions } from "@/lib/services/form-answerer";
import { generateTailoredResumePDF } from "@/lib/services/resume-pdf";
import { canPerformAction } from "@/lib/anti-detection/rate-limiter";

/**
 * Resolve userId from NextAuth session OR extension x-auth-token header.
 * The extension authenticates with its stored token (the userId).
 */
async function resolveUserId(req: Request): Promise<string | null> {
  // Try NextAuth session first (dashboard calls)
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  // Fall back to extension token header
  const token = req.headers.get("x-auth-token");
  if (token && mongoose.Types.ObjectId.isValid(token)) {
    await connectDB();
    const user = await User.exists({ _id: token });
    if (user) return token;
  }
  return null;
}
// LinkedIn search URL builder
function buildLinkedInSearchURL(search: {
  keywords: string;
  location?: string;
  remote?: boolean;
  experienceLevel?: string[];
  datePosted?: string;
  easyApplyOnly?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("keywords", search.keywords);
  if (search.location) params.set("location", search.location);

  // LinkedIn f_TPR (time posted range)
  const timeMap: Record<string, string> = {
    "past-24h": "r86400",
    "past-week": "r604800",
    "past-month": "r2592000",
  };
  if (search.datePosted && timeMap[search.datePosted]) {
    params.set("f_TPR", timeMap[search.datePosted]);
  }

  // Experience level mapping
  const expMap: Record<string, string> = {
    internship: "1",
    entry: "2",
    associate: "3",
    "mid-senior": "4",
    director: "5",
    executive: "6",
  };
  if (search.experienceLevel?.length) {
    params.set("f_E", search.experienceLevel.map((e) => expMap[e] || "").filter(Boolean).join(","));
  }

  if (search.remote) params.set("f_WT", "2"); // Remote
  if (search.easyApplyOnly) params.set("f_AL", "true"); // Easy Apply

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function extractGeminiQuotaInfo(errorMessage: string) {
  const text = (errorMessage || "").toString();
  const isGemini = /gemini/i.test(text);
  const isQuotaExceeded =
    /\b429\b/.test(text) &&
    (/quota exceeded|resource_exhausted|rate[-\s]?limit|exceeded your current quota/i.test(text));

  if (!isGemini || !isQuotaExceeded) {
    return null;
  }

  const retryMatch = text.match(/retryDelay\"?\s*:\s*\"?(\d+)s/i) || text.match(/retry in\s+([\d.]+)s/i);
  const limitMatch = text.match(/quotaValue\"?\s*:\s*\"?(\d+)\"?/i) || text.match(/limit:\s*(\d+)/i);
  const modelMatch = text.match(/\"model\"\s*:\s*\"([^\"]+)\"/i) || text.match(/model:\s*([a-zA-Z0-9._-]+)/i);

  const retryAfterSeconds = retryMatch ? Math.max(1, Math.round(Number(retryMatch[1]))) : 0;
  const dailyLimit = limitMatch ? Number(limitMatch[1]) : 0;
  const model = modelMatch?.[1] || "gemini-2.5-flash";

  return {
    provider: "gemini",
    model,
    exhausted: true,
    remaining: 0,
    dailyLimit,
    retryAfterSeconds,
  };
}

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

    const { searchParams } = new URL(req.url);
    const step = searchParams.get("step");
    const body = await req.json();

    await connectDB();

    // ── Step 1: Start automation — return search URL for extension to navigate to
    if (step === "start") {
      const { searchId } = body;
      if (!searchId) {
        return NextResponse.json({ error: "searchId is required" }, { status: 400 });
      }

      const search = await JobSearch.findOne({ _id: searchId, userId }).lean();
      if (!search) {
        return NextResponse.json({ error: "Search not found" }, { status: 404 });
      }

      // Check if we can still apply today
      const { allowed, current, limit } = await canPerformAction(userId, "applies");
      if (!allowed) {
        return NextResponse.json({ error: "Daily application limit reached", remaining: 0 }, { status: 429 });
      }

      const searchUrl = buildLinkedInSearchURL(search);

      return NextResponse.json({
        command: "NAVIGATE",
        url: searchUrl,
        searchId,
        remaining: limit - current,
        searchConfig: {
          keywords: search.keywords,
          easyApplyOnly: search.easyApplyOnly,
          minMatchScore: 60,
        },
      });
    }

    // ── Step 2: Process scraped jobs — score them, return qualifying ones
    if (step === "process-jobs") {
      const { jobs, searchId, minMatchScore } = body;
      if (!jobs?.length || !searchId) {
        return NextResponse.json({ error: "jobs and searchId are required" }, { status: 400 });
      }

      const effectiveMinMatchScore =
        typeof minMatchScore === "number" && Number.isFinite(minMatchScore)
          ? Math.max(0, Math.min(100, Math.round(minMatchScore)))
          : 60;

      // Map extension scrape format to DiscoveredJob format
      const discoveredJobs = jobs.map((j: {
        title: string;
        company: string;
        location?: string;
        url: string;
        description?: string;
        easyApply?: boolean;
      }) => ({
        jobTitle: j.title,
        company: j.company,
        location: j.location || "",
        jobUrl: j.url,
        jobDescription: j.description || "",
        easyApply: j.easyApply ?? true,
      }));

      const result = await processDiscoveredJobs(
        userId,
        discoveredJobs,
        searchId,
        effectiveMinMatchScore
      );

      // Fetch the qualifying applications to send back
      const applications = await JobApplication.find({
        userId,
        jobSearchId: searchId,
        status: "found",
      })
        .sort({ matchScore: -1 })
        .limit(15)
        .lean();

      return NextResponse.json({
        result,
        applications: applications.map((a) => ({
          _id: a._id.toString(),
          jobTitle: a.jobTitle,
          company: a.company,
          jobUrl: a.jobUrl,
          matchScore: a.matchScore,
        })),
      });
    }

    // ── Step 2b: Register job without AI (used when AI mode is off)
    if (step === "register-job") {
      const { searchId, job } = body as {
        searchId?: string;
        job?: {
          title?: string;
          company?: string;
          location?: string;
          url?: string;
          description?: string;
        };
      };

      if (!searchId || !job?.url || !job?.title || !job?.company) {
        return NextResponse.json({ error: "searchId and job(title/company/url) are required" }, { status: 400 });
      }

      const application = await JobApplication.findOneAndUpdate(
        { userId, jobUrl: job.url },
        {
          $setOnInsert: {
            userId,
            jobSearchId: searchId,
            jobTitle: job.title,
            company: job.company,
            location: job.location || "",
            jobUrl: job.url,
            jobDescription: job.description || "",
            status: "found",
            matchScore: 0,
          },
        },
        {
          upsert: true,
          new: true,
        }
      ).lean();

      return NextResponse.json({
        success: true,
        application: {
          _id: application?._id?.toString(),
          jobTitle: application?.jobTitle || job.title,
          company: application?.company || job.company,
          jobUrl: application?.jobUrl || job.url,
          matchScore: application?.matchScore ?? 0,
        },
      });
    }

    // ── Step 3: Prepare single application — tailor resume + generate PDF
    if (step === "prepare-apply") {
      const { applicationId } = body;
      if (!applicationId) {
        return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
      }

      const prepResult = await prepareJobApplication(userId, applicationId);
      if (!prepResult.success) {
        const quota = extractGeminiQuotaInfo(prepResult.error || "");
        if (quota) {
          const retryNote = quota.retryAfterSeconds > 0
            ? `Retry in ~${quota.retryAfterSeconds}s`
            : "Retry later";
          const limitNote = quota.dailyLimit > 0 ? `Daily free-tier limit: ${quota.dailyLimit}` : "Daily free-tier quota reached";

          return NextResponse.json(
            {
              error: `Gemini API quota exhausted. ${limitNote}. ${retryNote}, switch to a new Gemini API key, or disable AI tailoring for now.`,
              code: "GEMINI_QUOTA_EXCEEDED",
              ai: quota,
            },
            { status: 429 }
          );
        }

        return NextResponse.json({ error: prepResult.error }, { status: 400 });
      }

      // Get the updated application with tailored data
      const application = await JobApplication.findOne({ _id: applicationId, userId }).lean();
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      // Generate tailored PDF
      const pdf = await generateTailoredResumePDF(userId, {
        summary: application.tailoredResume?.summary,
        skills: application.tailoredResume?.skills,
        highlights: application.tailoredResume?.highlights,
      });

      return NextResponse.json({
        applicationId,
        jobUrl: application.jobUrl,
        resumePdf: pdf.base64,
        resumeFileName: pdf.fileName,
        matchScore: application.matchScore,
      });
    }

    // ── Step 4: Answer form questions from Easy Apply modal
    if (step === "answer-form") {
      const { questions, applicationId } = body;
      if (!questions?.length) {
        return NextResponse.json({ error: "questions array is required" }, { status: 400 });
      }

      const user = await User.findById(userId).lean() as Record<string, unknown> | null;
      const prefs = (user?.formPreferences as Record<string, string>) || {};

      const answers = await answerFormQuestions(
        userId,
        questions.map((q: { label: string; type: string }) => ({
          question: q.label,
          fieldType: q.type,
        })),
        prefs
      );

      // Save form answers to the application
      if (applicationId) {
        await JobApplication.findOneAndUpdate(
          { _id: applicationId, userId },
          {
            formAnswers: answers.map((a) => ({
              question: a.question,
              answer: a.answer.answer,
              fieldType: a.fieldType,
            })),
          }
        );
      }

      return NextResponse.json({
        answers: answers.map((a) => ({
          question: a.question,
          answer: a.answer.answer,
          confidence: a.answer.confidence,
          fieldType: a.fieldType,
        })),
      });
    }

    // ── Step 5: Mark application complete
    if (step === "complete") {
      const { applicationId, success, notes } = body;
      if (!applicationId || typeof success !== "boolean") {
        return NextResponse.json({ error: "applicationId and success are required" }, { status: 400 });
      }

      await completeApplication(userId, applicationId, success, notes);

      // Check remaining
      const { current, limit } = await canPerformAction(userId, "applies");

      return NextResponse.json({ success: true, remaining: limit - current });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (error) {
    console.error("[Automation] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
