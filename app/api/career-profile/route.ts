import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorId } from "@/lib/utils/get-actor-id";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeForAI } from "@/lib/utils";
import {
  getCareerProfile,
  upsertCareerProfile,
} from "@/lib/services/career-profile";
import { parseResumeWithAI } from "@/lib/services/resume-service";
import { forgetRelevanceProfile } from "@/lib/outreach/relevance-profile";

const experienceSchema = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().optional().nullable(),
  current: z.boolean().default(false),
  description: z.string().default(""),
  highlights: z.array(z.string()).default([]),
});

const educationSchema = z.object({
  school: z.string().default(""),
  degree: z.string().default(""),
  field: z.string().default(""),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  gpa: z.string().optional().nullable(),
});

const careerProfileSchema = z.object({
  contactInfo: z
    .object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      location: z.string().optional(),
      linkedin: z.string().optional(),
      github: z.string().optional(),
      portfolio: z.string().optional(),
    })
    .optional(),
  summary: z.string().optional(),
  experience: z.array(experienceSchema).optional(),
  education: z.array(educationSchema).optional(),
  skills: z.array(z.string()).optional(),
  certifications: z
    .array(
      z.object({
        name: z.string().default(""),
        issuer: z.string().default(""),
        date: z.string().optional().nullable(),
      })
    )
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string().default(""),
        description: z.string().default(""),
        url: z.string().optional().nullable(),
        tech: z.array(z.string()).default([]),
      })
    )
    .optional(),
});

export async function GET() {
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

    const profile = await getCareerProfile(userId);
    return NextResponse.json({
      profile: profile || {
        contactInfo: {},
        summary: "",
        experience: [],
        education: [],
        skills: [],
        certifications: [],
        projects: [],
      },
      exists: !!profile,
    });
  } catch (error) {
    console.error("[CareerProfile] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Paste whole career text → AI structured fields (review before save) */
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

    if (action !== "parse") {
      return NextResponse.json(
        { error: "Invalid action. Use ?action=parse" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const rawText = typeof body.rawText === "string" ? body.rawText : "";
    if (!rawText || rawText.trim().length < 40) {
      return NextResponse.json(
        {
          error:
            "Paste more career details (at least a short bio plus experience/projects).",
        },
        { status: 400 }
      );
    }
    if (rawText.length > 60000) {
      return NextResponse.json(
        { error: "Text is too long (max 60,000 characters)." },
        { status: 400 }
      );
    }

    const sanitized = sanitizeForAI(rawText);
    try {
      const parsed = await parseResumeWithAI(userId, sanitized);
      return NextResponse.json({ parsed }, { status: 200 });
    } catch (error) {
      console.error("[CareerProfile] parse error:", error);
      const message =
        error instanceof Error ? error.message : "Failed to parse career data";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    console.error("[CareerProfile] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await getActorId();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: userId, isGuest } = actor;

    if (isGuest) {
      return NextResponse.json(
        { error: "Create a free account to save career data", requiresAuth: true },
        { status: 403 }
      );
    }

    const rateLimit = await checkApiRateLimit(userId);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = careerProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid career data" },
        { status: 400 }
      );
    }

    const data = {
      contactInfo: parsed.data.contactInfo,
      summary: parsed.data.summary,
      experience: parsed.data.experience?.map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate || "",
        endDate: e.endDate || undefined,
        current: e.current,
        description: e.description,
        highlights: e.highlights || [],
      })),
      education: parsed.data.education?.map((e) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
        startDate: e.startDate || undefined,
        endDate: e.endDate || undefined,
        gpa: e.gpa || undefined,
      })),
      skills: parsed.data.skills,
      certifications: parsed.data.certifications?.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        date: c.date || undefined,
      })),
      projects: parsed.data.projects?.map((p) => ({
        name: p.name,
        description: p.description,
        url: p.url || undefined,
        tech: p.tech || [],
      })),
    };

    const profile = await upsertCareerProfile(userId, data);

    // The job-application relevance gate scores against this profile and caches
    // it. Editing your skills or job titles should change which jobs the agent
    // applies for immediately, not five minutes from now.
    forgetRelevanceProfile(userId);

    return NextResponse.json({ profile, success: true });
  } catch (error) {
    console.error("[CareerProfile] PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
