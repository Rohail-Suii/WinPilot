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
import connectDB from "@/lib/db/connection";
import JobSearch from "@/lib/db/models/job-search";
import JobApplication from "@/lib/db/models/job-application";
import ActivityLog from "@/lib/db/models/activity-log";
import User from "@/lib/db/models/user";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { processDiscoveredJobs, prepareJobApplication, completeApplication, updateApplicationStatus } from "@/lib/services/job-analysis";
import { answerFormQuestions } from "@/lib/services/form-answerer";
import { generateTailoredResumePDF } from "@/lib/services/resume-pdf";
import { generateOutreachMessage } from "@/lib/services/company-outreach";
import { canPerformAction, incrementUsage } from "@/lib/anti-detection/rate-limiter";
import { resolveRequestUserId as resolveUserId } from "@/lib/utils/get-actor-id";
import { parseLinkedInJobUrl, parseLinkedInJobListUrl, buildJobUrl } from "@/lib/utils/linkedin-url";
import { parseIndeedJobUrl, parseIndeedJobListUrl, buildIndeedJobUrl } from "@/lib/utils/indeed-url";
import { splitKeywords, buildLinkedInSearchURL, buildIndeedSearchURL } from "@/lib/services/job-search-builders";
import type { JobSearchPlatform } from "@/lib/db/models/job-search";
import type { JobApplicationPlatform } from "@/lib/db/models/job-application";

/**
 * Applications left today, or null when daily caps are disabled — Infinity is
 * not representable in JSON, and the extension renders null as "unlimited".
 */
function remainingOrNull(limit: number, current: number): number | null {
  return Number.isFinite(limit) ? limit - current : null;
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
      const { searchId, platform: platformOverride } = body as { searchId?: string; platform?: JobSearchPlatform };
      if (!searchId) {
        return NextResponse.json({ error: "searchId is required" }, { status: 400 });
      }

      const search = await JobSearch.findOne({ _id: searchId, userId }).lean();
      if (!search) {
        return NextResponse.json({ error: "Search not found" }, { status: 404 });
      }

      // Check if we can still apply today. Daily caps are disabled unless
      // ENFORCE_DAILY_LIMITS is set, in which case this still gates the run.
      const { allowed, current, limit } = await canPerformAction(userId, "applies");
      if (!allowed) {
        return NextResponse.json({ error: "Daily application limit reached", remaining: 0 }, { status: 429 });
      }

      const keywordList = splitKeywords(search.keywords);
      if (!keywordList.length) {
        return NextResponse.json({ error: "Search has no keywords configured" }, { status: 400 });
      }
      // LinkedIn entries first, then Indeed — the extension runs one platform's
      // tab at a time, so a "both" search processes them sequentially rather
      // than interleaving. A platform passed with this request (the dashboard's
      // run-time platform selector) overrides whatever is saved on the search.
      const validPlatforms = new Set(["linkedin", "indeed", "both"]);
      const platform: JobSearchPlatform =
        (platformOverride && validPlatforms.has(platformOverride) ? platformOverride : null) ||
        search.platform ||
        "linkedin";
      const searches: { keyword: string; url: string; platform: "linkedin" | "indeed" }[] = [];
      if (platform === "linkedin" || platform === "both") {
        for (const keyword of keywordList) {
          searches.push({ keyword, url: buildLinkedInSearchURL(search, keyword), platform: "linkedin" });
        }
      }
      if (platform === "indeed" || platform === "both") {
        for (const keyword of keywordList) {
          searches.push({ keyword, url: buildIndeedSearchURL(search, keyword), platform: "indeed" });
        }
      }

      return NextResponse.json({
        command: "NAVIGATE",
        searchId,
        remaining: remainingOrNull(limit, current),
        searches,
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
        platform?: JobApplicationPlatform;
      }) => ({
        jobTitle: j.title,
        company: j.company,
        location: j.location || "",
        jobUrl: j.url,
        jobDescription: j.description || "",
        easyApply: j.easyApply ?? true,
        platform: j.platform || (parseIndeedJobUrl(j.url) ? "indeed" : "linkedin"),
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
          platform?: JobApplicationPlatform;
        };
      };

      // searchId is optional: single-link applies have no saved search behind them
      if (!job?.url || !job?.title || !job?.company) {
        return NextResponse.json({ error: "job(title/company/url) is required" }, { status: 400 });
      }

      const platform: JobApplicationPlatform =
        job.platform || (parseIndeedJobUrl(job.url) ? "indeed" : "linkedin");

      const application = await JobApplication.findOneAndUpdate(
        { userId, jobUrl: job.url },
        {
          $setOnInsert: {
            userId,
            ...(searchId ? { jobSearchId: searchId } : {}),
            platform,
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

    // ── Step 2c: Resolve a user-pasted LinkedIn link into one job to apply to
    if (step === "single-apply") {
      const { url } = body as { url?: string };
      if (!url) {
        return NextResponse.json({ error: "url is required" }, { status: 400 });
      }

      // Try LinkedIn first, then Indeed — the pasted link tells us which platform.
      const platform: "linkedin" | "indeed" = parseLinkedInJobUrl(url) ? "linkedin" : "indeed";
      const parsed = platform === "linkedin" ? parseLinkedInJobUrl(url) : parseIndeedJobUrl(url);
      if (!parsed) {
        return NextResponse.json(
          {
            error:
              "That does not look like a LinkedIn or Indeed job link. Paste a job page URL, a search URL with a job open, or the job id.",
          },
          { status: 400 }
        );
      }

      const { allowed, current, limit } = await canPerformAction(userId, "applies");
      if (!allowed) {
        return NextResponse.json({ error: "Daily application limit reached", remaining: 0 }, { status: 429 });
      }

      // A job the user already applied to is reported back rather than reapplied.
      const existing = await JobApplication.findOne({ userId, jobUrl: parsed.jobUrl }).lean();

      return NextResponse.json({
        command: "APPLY_JOB_URL",
        platform,
        jobId: parsed.jobId,
        jobUrl: parsed.jobUrl,
        remaining: remainingOrNull(limit, current),
        alreadyApplied: existing?.status === "applied",
        existing: existing
          ? {
              _id: existing._id.toString(),
              jobTitle: existing.jobTitle,
              company: existing.company,
              status: existing.status,
              appliedAt: existing.appliedAt ?? null,
            }
          : null,
      });
    }

    // ── Step 2d: Resolve a pasted results page into a list of jobs to apply to
    if (step === "list-apply") {
      const { url } = body as { url?: string };
      if (!url) {
        return NextResponse.json({ error: "url is required" }, { status: 400 });
      }

      // Try LinkedIn first, then Indeed — the pasted link tells us which platform.
      const platform: "linkedin" | "indeed" = parseLinkedInJobListUrl(url) ? "linkedin" : "indeed";
      const parsed = platform === "linkedin" ? parseLinkedInJobListUrl(url) : parseIndeedJobListUrl(url);
      if (!parsed) {
        return NextResponse.json(
          {
            error:
              "That link is not a LinkedIn or Indeed jobs list. Paste a job search, a collection, or a results page.",
          },
          { status: 400 }
        );
      }

      const { allowed, current, limit } = await canPerformAction(userId, "applies");
      if (!allowed) {
        return NextResponse.json({ error: "Daily application limit reached", remaining: 0 }, { status: 429 });
      }

      const remaining = remainingOrNull(limit, current);
      // One results page holds ~25 jobs on LinkedIn, ~15 on Indeed; that's the cap for one run.
      const pageSize = platform === "linkedin" ? 25 : 15;

      return NextResponse.json({
        command: "APPLY_JOB_LIST",
        platform,
        listUrl: parsed.listUrl,
        // Ids named by the link itself, used only if the page renders no readable list
        jobIds: parsed.jobIds,
        jobUrls: parsed.jobIds.map(platform === "linkedin" ? buildJobUrl : buildIndeedJobUrl),
        remaining,
        maxJobs: remaining == null ? pageSize : Math.max(0, Math.min(pageSize, remaining)),
      });
    }

    // ── Step 2e: Which of these job URLs has this user already applied to?
    if (step === "filter-applied") {
      const { jobUrls } = body as { jobUrls?: string[] };
      if (!Array.isArray(jobUrls) || jobUrls.length === 0) {
        return NextResponse.json({ error: "jobUrls is required" }, { status: 400 });
      }

      const applied = await JobApplication.find(
        { userId, jobUrl: { $in: jobUrls.slice(0, 100) }, status: "applied" },
        { jobUrl: 1 }
      ).lean();

      return NextResponse.json({ appliedUrls: applied.map((a) => a.jobUrl) });
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
      const pdf = await generateTailoredResumePDF(
        userId,
        {
          summary: application.tailoredResume?.summary,
          skills: application.tailoredResume?.skills,
          highlights: application.tailoredResume?.highlights,
          experience: application.tailoredResume?.experience,
          projects: application.tailoredResume?.projects,
        },
        application.tailoredResume?.source
      );

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
      const settings = (user?.settings as Record<string, unknown> | undefined) || {};
      const prefs = {
        ...((user?.formPreferences as Record<string, string>) || {}),
        ...((settings.formPreferences as Record<string, string>) || {}),
      };

      const platform: JobApplicationPlatform = applicationId
        ? ((await JobApplication.findOne({ _id: applicationId, userId }, { platform: 1 }).lean())
            ?.platform || "linkedin")
        : "linkedin";

      const answers = await answerFormQuestions(
        userId,
        questions.map(
          (q: {
            label?: string;
            question?: string;
            type?: string;
            fieldType?: string;
            options?: string[];
            maxLength?: number;
            expectedFormat?: "digits" | "decimal" | "yes_no" | "text" | "long_text" | "currency" | "date" | "unknown";
          }) => ({
            question: q.label || q.question || "",
            fieldType: q.type || q.fieldType || "text",
            options: Array.isArray(q.options) ? q.options : undefined,
            maxLength: typeof q.maxLength === "number" ? q.maxLength : undefined,
            expectedFormat: q.expectedFormat,
          })
        ),
        prefs,
        platform
      );

      // Save form answers to the application (append per step)
      if (applicationId) {
        const mapped = answers.map((a) => ({
          question: a.question,
          answer: a.answer.answer,
          fieldType: a.fieldType,
        }));
        await JobApplication.findOneAndUpdate(
          { _id: applicationId, userId },
          { $push: { formAnswers: { $each: mapped } } }
        );
      }

      return NextResponse.json({
        answers: answers.map((a) => ({
          question: a.question,
          answer: a.answer.answer,
          confidence: a.answer.confidence,
          source: a.answer.source,
          fieldType: a.fieldType,
        })),
      });
    }

    // ── Step 4b: Write the follow-up message for a job we just applied to
    if (step === "outreach-message") {
      const { applicationId, channel, recipientName, recipientHeadline } = body as {
        applicationId?: string;
        channel?: "hiring_team" | "company_page" | "connection";
        recipientName?: string;
        recipientHeadline?: string;
      };

      if (!applicationId || !channel) {
        return NextResponse.json({ error: "applicationId and channel are required" }, { status: 400 });
      }

      const application = await JobApplication.findOne({ _id: applicationId, userId }).lean();
      if (!application) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      const { allowed } = await canPerformAction(userId, "messages");
      if (!allowed) {
        return NextResponse.json({ error: "Daily message limit reached" }, { status: 429 });
      }

      const outreach = await generateOutreachMessage(userId, {
        channel,
        jobTitle: application.jobTitle,
        company: application.company,
        recipientName,
        recipientHeadline,
        jobDescription: application.jobDescription,
      });

      return NextResponse.json(outreach);
    }

    // ── Step 4c: Record the outcome of an outreach attempt
    if (step === "outreach-complete") {
      const { applicationId, sent, channel, recipient, message, reason } = body as {
        applicationId?: string;
        sent?: boolean;
        channel?: "hiring_team" | "company_page" | "connection";
        recipient?: string;
        message?: string;
        reason?: string;
      };

      if (!applicationId || typeof sent !== "boolean" || !channel) {
        return NextResponse.json({ error: "applicationId, sent, and channel are required" }, { status: 400 });
      }

      const updated = await JobApplication.findOneAndUpdate(
        { _id: applicationId, userId },
        {
          $push: {
            outreach: {
              sent,
              channel,
              recipient: recipient || undefined,
              message: sent ? message || undefined : undefined,
              reason: sent ? undefined : reason || "Messaging not available",
              at: new Date(),
            },
          },
        },
        { new: true }
      ).lean();

      if (!updated) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }

      if (sent) {
        await incrementUsage(userId, "messages");
      }

      await ActivityLog.create({
        userId,
        action: sent ? "company_messaged" : "company_message_skipped",
        module: "jobs",
        details: { applicationId, channel, recipient, reason },
        status: sent ? "success" : "skipped",
        timestamp: new Date(),
      });

      return NextResponse.json({ success: true });
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

      return NextResponse.json({ success: true, remaining: remainingOrNull(limit, current) });
    }

    // ── Step 6: Update status
    if (step === "update-status") {
      const { applicationId, status, notes } = body;
      if (!applicationId || !status) {
        return NextResponse.json({ error: "applicationId and status are required" }, { status: 400 });
      }

      await updateApplicationStatus(userId, applicationId, status, notes);
      return NextResponse.json({ success: true });
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
