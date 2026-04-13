import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeForAI } from "@/lib/utils";
import {
  parseResumeWithAI,
  saveResume,
  getUserResumes,
  updateResume,
  deleteResume,
} from "@/lib/services/resume-service";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkApiRateLimit(session.user.id);
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const resumes = await getUserResumes(session.user.id);
    return NextResponse.json({ resumes });
  } catch (error) {
    console.error("[Resume] Error:", error);
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

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "parse") {
      // Parse raw text with AI
      const { rawText, name } = await req.json();
      if (!rawText || rawText.length < 50) {
        return NextResponse.json(
          { error: "Resume text is too short. Paste your full resume text." },
          { status: 400 }
        );
      }
      if (rawText.length > 50000) {
        return NextResponse.json(
          { error: "Resume text is too long (max 50,000 characters)." },
          { status: 400 }
        );
      }

      const sanitizedRawText = sanitizeForAI(rawText);

      try {
        const parsed = await parseResumeWithAI(session.user.id, sanitizedRawText);
        return NextResponse.json({ parsed, rawText, name: name || "My Resume" }, { status: 200 });
      } catch (error) {
        console.error("[Resume] Failed to parse resume:", error);
        const message = error instanceof Error ? error.message : "Failed to parse resume";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (action === "save-parsed") {
      // Save reviewed/edited parsed data
      const { name, parsed, rawText: originalText } = await req.json();
      if (!parsed || !name) {
        return NextResponse.json(
          { error: "Parsed data and name are required" },
          { status: 400 }
        );
      }

      try {
        const resume = await saveResume(
          session.user.id,
          name,
          parsed,
          originalText || "",
          true
        );
        return NextResponse.json({ resume }, { status: 201 });
      } catch (error) {
        console.error("[Resume] Failed to save resume:", error);
        const message = error instanceof Error ? error.message : "Failed to save resume";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (action === "manual") {
      // Save manually entered resume data
      const body = await req.json();
      const { name, contactInfo, summary, experience, education, skills, certifications, projects } = body;

      if (!name) {
        return NextResponse.json({ error: "Resume name is required" }, { status: 400 });
      }

      try {
        const resume = await saveResume(
          session.user.id,
          name,
          { contactInfo: contactInfo || {}, summary: summary || "", experience: experience || [], education: education || [], skills: skills || [], certifications: certifications || [], projects: projects || [] },
          "",
          true
        );
        return NextResponse.json({ resume }, { status: 201 });
      } catch (error) {
        console.error("[Resume] Failed to save resume:", error);
        const message = error instanceof Error ? error.message : "Failed to save resume";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid action. Use ?action=parse or ?action=manual" }, { status: 400 });
  } catch (error) {
    console.error("[Resume] Error:", error);
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
      return NextResponse.json({ error: "Resume ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const ALLOWED_FIELDS = ["name", "contactInfo", "summary", "experience", "education", "skills", "certifications", "projects", "isDefault", "customTailoringPrompt"];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        updates[key] = body[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }
    const resume = await updateResume(session.user.id, id, updates);

    if (!resume) {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    return NextResponse.json({ resume });
  } catch (error) {
    console.error("[Resume] Error:", error);
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
    if (!id) {
      return NextResponse.json({ error: "Resume ID is required" }, { status: 400 });
    }

    await deleteResume(session.user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Resume] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
