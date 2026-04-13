import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import {
  buildLinkedInPostPrompt,
  buildLinkedInCommentPrompt,
  buildFormAnswerPrompt,
  buildOutreachMessagePrompt,
  buildJobMatchScoringPrompt,
  buildResumeTailoringPrompt,
  buildResumeParsingPrompt,
} from "@/lib/ai/prompts";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkApiRateLimit(session.user.id);
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const { type } = body;
  if (!type) {
    return NextResponse.json({ error: "Type is required" }, { status: 400 });
  }

  const ai = await getUserAIProvider(session.user.id);
  if (!ai) {
    return NextResponse.json(
      { error: "No AI API key configured. Add one in Settings → AI Keys." },
      { status: 400 }
    );
  }

  try {
    switch (type) {
      case "linkedin-post": {
        const { topic, niche, targetAudience, voiceTone, contentPillars } = body;
        if (!topic) {
          return NextResponse.json({ error: "Topic is required" }, { status: 400 });
        }
        const messages = buildLinkedInPostPrompt(
          topic,
          niche || "general",
          targetAudience || "professionals",
          voiceTone || "professional",
          contentPillars || []
        );
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "linkedin-comment": {
        const { postContent, niche, voiceTone } = body;
        if (!postContent) {
          return NextResponse.json({ error: "Post content is required" }, { status: 400 });
        }
        const messages = buildLinkedInCommentPrompt(postContent, niche || "general", voiceTone || "professional");
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "form-answer": {
        const { question, resumeContext, userPreferences } = body;
        if (!question) {
          return NextResponse.json({ error: "Question is required" }, { status: 400 });
        }
        const messages = buildFormAnswerPrompt(question, resumeContext || "", userPreferences);
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "outreach-message": {
        const { recipientName, recipientHeadline, recipientPostContent, niche, value } = body;
        const messages = buildOutreachMessagePrompt(
          recipientName || "there",
          recipientHeadline || "",
          recipientPostContent || "",
          niche || "general",
          value || "professional expertise"
        );
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "job-match": {
        const { resumeText, jobDescription } = body;
        if (!resumeText || !jobDescription) {
          return NextResponse.json({ error: "Resume text and job description are required" }, { status: 400 });
        }
        const messages = buildJobMatchScoringPrompt(resumeText, jobDescription);
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "resume-tailor": {
        const { resumeData, jobDescription, customPrompt } = body;
        if (!resumeData || !jobDescription) {
          return NextResponse.json({ error: "Resume data and job description are required" }, { status: 400 });
        }
        const messages = buildResumeTailoringPrompt(resumeData, jobDescription, customPrompt);
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      case "resume-parse": {
        const { rawText } = body;
        if (!rawText) {
          return NextResponse.json({ error: "Raw text is required" }, { status: 400 });
        }
        const messages = buildResumeParsingPrompt(rawText);
        const result = await ai.generateJSON(messages);
        return NextResponse.json({ content: result });
      }

      default: {
        // Fallback: generic prompt
        const { prompt } = body;
        if (!prompt) {
          return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
        }
        const result = await ai.generateText([
          { role: "system", content: "You are a helpful AI assistant for LinkedIn automation." },
          { role: "user", content: prompt },
        ]);
        return NextResponse.json({ content: result });
      }
    }
  } catch (error) {
    console.error("[AI Generate] Failed:", error);
    const message = error instanceof Error ? error.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
