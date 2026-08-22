/**
 * Job Analysis Service
 * Analyzes discovered jobs, scores them, and manages the application pipeline.
 */

import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";
import JobApplication from "@/lib/db/models/job-application";
import type { ApplicationStatus } from "@/lib/db/models/job-application";
import ActivityLog from "@/lib/db/models/activity-log";
import { getJobMatchScore, tailorResumeForJob } from "./resume-tailor";
import { canPerformAction, incrementUsage } from "@/lib/anti-detection/rate-limiter";

interface DiscoveredJob {
  jobTitle: string;
  company: string;
  location?: string;
  jobUrl: string;
  jobDescription: string;
  salary?: string;
  postedDate?: string;
  easyApply: boolean;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

/**
 * Process discovered jobs: score, filter, and store
 */
export async function processDiscoveredJobs(
  userId: string,
  jobs: DiscoveredJob[],
  jobSearchId: string,
  minMatchScore: number = 60
): Promise<{ added: number; skipped: number; duplicates: number }> {
  await connectDB();

  let added = 0;
  let skipped = 0;
  let duplicates = 0;

  // Check for duplicates first (batch)
  const existingUrls = new Set(
    (await JobApplication.find({ userId, jobUrl: { $in: jobs.map(j => j.jobUrl) } }, { jobUrl: 1 }).lean())
      .map(j => j.jobUrl)
  );

  // Filter out duplicates
  const newJobs = jobs.filter(job => {
    if (existingUrls.has(job.jobUrl)) {
      duplicates++;
      return false;
    }
    return true;
  });

  // Process AI scoring with concurrency limit of 5
  const CONCURRENCY = 5;
  for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
    const batch = newJobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (job) => {
        let matchScore = 0;
        let matchBreakdown = {};
        try {
          const match = await getJobMatchScore(userId, job.jobDescription);
          matchScore = match.score;
          matchBreakdown = {
            skillsMatch: match.skillsMatch,
            experienceMatch: match.experienceMatch,
            educationMatch: match.educationMatch,
            matchingSkills: match.matchingSkills,
            missingSkills: match.missingSkills,
            strengths: match.strengths,
            concerns: match.concerns,
            recommendation: match.recommendation,
          };
        } catch {
          matchScore = 50;
        }
        return { job, matchScore, matchBreakdown };
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        skipped++;
        continue;
      }
      const { job, matchScore, matchBreakdown } = result.value;

      if (matchScore < minMatchScore) {
        skipped++;
        continue;
      }

      await JobApplication.create({
        userId,
        jobSearchId,
        jobTitle: job.jobTitle,
        company: job.company,
        location: job.location,
        jobUrl: job.jobUrl,
        jobDescription: job.jobDescription,
        status: "found" as ApplicationStatus,
        matchScore,
        matchBreakdown,
      });

      added++;
    }
  }

  return { added, skipped, duplicates };
}

/**
 * Prepare a job for application (tailor resume, generate answers)
 */
export async function prepareJobApplication(
  userId: string,
  applicationId: string
): Promise<{ success: boolean; error?: string }> {
  await connectDB();

  const application = await JobApplication.findOne({ _id: applicationId, userId });
  if (!application) {
    return { success: false, error: "Application not found" };
  }

  // Check rate limits
  const { allowed } = await canPerformAction(userId, "applies");
  if (!allowed) {
    return { success: false, error: "Daily application limit reached" };
  }

  // Update status to tailoring
  application.status = "tailoring";
  await application.save();

  try {
    // Tailor resume for this job
    const tailored = await tailorResumeForJob(userId, application.jobDescription);

    application.tailoredResume = {
      summary: typeof tailored.tailoredSummary === "string" ? tailored.tailoredSummary : "",
      skills: normalizeStringArray(tailored.tailoredSkills),
      highlights: normalizeStringArray(tailored.tailoredHighlights),
      matchExplanation: typeof tailored.matchExplanation === "string" ? tailored.matchExplanation : "",
      keywordsUsed: normalizeStringArray(tailored.keywordsUsed),
      detectedRole: typeof tailored.detectedRole === "string" ? tailored.detectedRole : "",
      source: tailored.source,
      experience: (tailored.tailoredExperience || []).map((e) => ({
        company: e.company,
        title: e.title,
        description: e.description,
        highlights: normalizeStringArray(e.highlights),
      })),
      projects: (tailored.tailoredProjects || []).map((p) => ({
        name: p.name,
        description: p.description,
        tech: normalizeStringArray(p.tech),
      })),
    };
    application.matchScore = tailored.matchScore;
    application.status = "applying";
    await application.save();

    return { success: true };
  } catch (error) {
    application.status = "found"; // Reset status
    await application.save();
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to tailor resume",
    };
  }
}

/**
 * Mark an application as completed
 */
export async function completeApplication(
  userId: string,
  applicationId: string,
  success: boolean,
  notes?: string
): Promise<void> {
  await connectDB();

  const status: ApplicationStatus = success ? "applied" : "failed";

  await JobApplication.findOneAndUpdate(
    { _id: applicationId, userId },
    {
      status,
      appliedAt: success ? new Date() : undefined,
      notes: notes || undefined,
    }
  );

  if (success) {
    await incrementUsage(userId, "applies");
  }

  // Log the activity
  await ActivityLog.create({
    userId,
    action: success ? "job_applied" : "job_failed",
    module: "jobs",
    details: { applicationId },
    status: success ? "success" : "failure",
    timestamp: new Date(),
  });
}

/**
 * Update application status
 */
export async function updateApplicationStatus(
  userId: string,
  applicationId: string,
  status: ApplicationStatus,
  notes?: string
): Promise<void> {
  await connectDB();

  const update: Record<string, unknown> = { status };
  if (notes) update.notes = notes;
  if (status === "applied") update.appliedAt = new Date();

  await JobApplication.findOneAndUpdate(
    { _id: applicationId, userId },
    update
  );
}

/**
 * Get application statistics
 */
export async function getApplicationStats(userId: string) {
  await connectDB();

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [total, thisWeek, thisMonth, byStatus, avgScore] = await Promise.all([
    JobApplication.countDocuments({ userId }),
    JobApplication.countDocuments({ userId, createdAt: { $gte: weekAgo } }),
    JobApplication.countDocuments({ userId, createdAt: { $gte: monthAgo } }),
    JobApplication.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    JobApplication.aggregate([
      { $match: { userId: userObjectId, matchScore: { $exists: true, $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$matchScore" } } },
    ]),
  ]);

  const statusMap: Record<string, number> = {};
  for (const s of byStatus) {
    statusMap[s._id] = s.count;
  }

  return {
    total,
    thisWeek,
    thisMonth,
    byStatus: statusMap,
    averageMatchScore: Math.round(avgScore[0]?.avg ?? 0),
  };
}
