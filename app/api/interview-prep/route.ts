import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorId } from "@/lib/utils/get-actor-id";
import connectDB from "@/lib/db/connection";
import InterviewPrep from "@/lib/db/models/interview-prep";
import JobApplication from "@/lib/db/models/job-application";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";

const generatePrepSchema = z.object({
  jobApplicationId: z.string().min(1, "Job application ID is required"),
});

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
    const jobApplicationId = searchParams.get("jobApplicationId");

    await connectDB();

    if (jobApplicationId) {
      const prep = await InterviewPrep.findOne({
        userId: userId,
        jobApplicationId,
      }).lean();

      return NextResponse.json({ prep });
    }

    // Return all interview preps for the user
    const preps = await InterviewPrep.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({ preps });
  } catch (error) {
    console.error("[InterviewPrep] Error:", error);
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

    const body = await req.json();
    const parsed = generatePrepSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await connectDB();

    const { getUserAIProvider } = await import("@/lib/ai/key-manager");
    const aiProvider = await getUserAIProvider(userId);
    if (!aiProvider) {
      return NextResponse.json(
        { error: "No AI API key configured. Please add one in Settings." },
        { status: 400 }
      );
    }

    // Get job application details
    const application = await JobApplication.findOne({
      _id: parsed.data.jobApplicationId,
      userId: userId,
    }).lean();

    if (!application) {
      return NextResponse.json({ error: "Job application not found" }, { status: 404 });
    }

    const { buildInterviewQuestionsPrompt, buildCompanyResearchPrompt } = await import("@/lib/ai/prompts");

    // Generate interview questions and company research in parallel
    const [questionsResult, companyResult] = await Promise.all([
      aiProvider.generateJSON<{
        questions: {
          question: string;
          suggestedAnswer: string;
          category: "behavioral" | "technical" | "situational" | "company";
        }[];
      }>(
        buildInterviewQuestionsPrompt(
          application.jobTitle,
          application.company,
          application.jobDescription || ""
        )
      ),
      aiProvider.generateJSON<{
        companyResearch: {
          overview: string;
          culture: string;
          recentNews: string[];
          competitors: string[];
        };
        salaryInsights: {
          min: number;
          max: number;
          median: number;
          source: string;
        };
      }>(
        buildCompanyResearchPrompt(application.company, "")
      ),
    ]);

    // Upsert the interview prep
    const prep = await InterviewPrep.findOneAndUpdate(
      {
        userId: userId,
        jobApplicationId: parsed.data.jobApplicationId,
      },
      {
        $set: {
          jobTitle: application.jobTitle,
          company: application.company,
          questions: questionsResult.questions,
          companyResearch: companyResult.companyResearch,
          salaryInsights: companyResult.salaryInsights,
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return NextResponse.json({ prep }, { status: 201 });
  } catch (error) {
    console.error("[InterviewPrep] Error:", error);
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

    const prep = await InterviewPrep.findOneAndDelete({
      _id: id,
      userId: userId,
    });

    if (!prep) {
      return NextResponse.json({ error: "Interview prep not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[InterviewPrep] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
