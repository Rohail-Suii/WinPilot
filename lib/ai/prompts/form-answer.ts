import type { AIMessage } from "../provider";

export interface FormAnswerFieldMeta {
  fieldType?: string;
  options?: string[];
  maxLength?: number;
  expectedFormat?: "digits" | "decimal" | "yes_no" | "text" | "long_text" | "currency" | "date" | "unknown";
  platform?: "linkedin" | "indeed";
}

export function buildFormAnswerPrompt(
  question: string,
  resumeContext: string,
  userPreferences?: Record<string, string>,
  fieldMeta?: FormAnswerFieldMeta
): AIMessage[] {
  const prefsText = userPreferences
    ? Object.entries(userPreferences)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "None provided";

  const fieldType = fieldMeta?.fieldType || "text";
  const options = fieldMeta?.options?.filter(Boolean) || [];
  const maxLength = fieldMeta?.maxLength;
  const expectedFormat = fieldMeta?.expectedFormat || "unknown";
  const platformLabel = fieldMeta?.platform === "indeed" ? "Indeed" : "LinkedIn";

  const optionsBlock =
    options.length > 0
      ? `\nAvailable choices (pick EXACTLY one of these labels):\n${options.map((o) => `- ${o}`).join("\n")}`
      : "";

  const formatRules = [
    expectedFormat === "digits" || /year|how many|experience/i.test(question)
      ? "- For years/experience/count questions: answer with digits only (e.g. 5), no words or units"
      : null,
    expectedFormat === "currency" || /salary|compensation|pay/i.test(question)
      ? "- For salary questions: digits only (no $ or currency symbols), reasonable monthly or yearly figure based on preferences/resume"
      : null,
    expectedFormat === "yes_no" || fieldType === "radio" || fieldType === "select"
      ? "- For yes/no or multiple choice: answer with the exact option label only"
      : null,
    maxLength
      ? `- Answer must be at most ${maxLength} characters`
      : "- Keep answers short unless the field is a cover letter / long text",
    fieldType === "textarea" || expectedFormat === "long_text"
      ? "- For cover letters or open-ended prompts: write 2-4 professional sentences"
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a job application form assistant. Answer quick-apply screening questions (${platformLabel}) accurately based on the candidate's resume and preferences.

Rules:
- Be concise and direct
- Match the expected input format exactly
- Never invent credentials, degrees, or employers not supported by the resume
- Prefer truthful answers from resume data over generic optimism
- If education/experience is unclear, use a conservative professional default
${formatRules}

Respond with valid JSON only. Schema:
{
  "answer": "string",
  "confidence": number (0-100),
  "reasoning": "string (brief explanation)"
}`,
    },
    {
      role: "user",
      content: `## Question
"${question}"

## Field metadata
- type: ${fieldType}
- expectedFormat: ${expectedFormat}
${maxLength ? `- maxLength: ${maxLength}` : ""}${optionsBlock}

## Candidate Resume Context
${resumeContext || "Not available"}

## User Preferences
${prefsText}

Answer this application question. Return JSON only.`,
    },
  ];
}
