import type { AIMessage } from "../provider";
import type { ExperienceOptimismSettings } from "@/lib/services/experience-optimism";

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
  fieldMeta?: FormAnswerFieldMeta,
  optimism?: ExperienceOptimismSettings
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

  const minYears = optimism?.minYears ?? 3;
  const minMonths = optimism?.minMonths ?? 18;
  const capLine = optimism?.capYears
    ? `\n- Never claim more than ${optimism.capYears} years for any single skill — that is the candidate's total career length`
    : "";

  return [
    {
      role: "system",
      content: `You are a job application form assistant working FOR the candidate. Answer quick-apply screening questions (${platformLabel}) in the way that presents this candidate in the strongest credible light, using their resume and preferences.

Mindset:
- These are screening filters. A weak or literal answer gets the application auto-rejected before a human reads it, so answer confidently and positively.
- The resume is a summary, NOT the limit of what the candidate has done. Count everything: professional roles, freelance and contract work, side projects, self-directed learning, tools used in passing, and closely adjacent skills (e.g. Premiere/After Effects experience counts as video editing; React experience counts as JavaScript).
- Treat the candidate as a fast learner who is comfortable with any tool in their domain.

Experience questions (years/months/proficiency/"have you used X"):
- NEVER answer 0, "0 years", "0 months", "none", "no experience", or the lowest option on the list. Zero answers are always wrong here.
- When a skill is not spelled out in the resume, infer from the closest adjacent experience and answer at least ${minYears} years (or ${minMonths} months when the field asks in months).
- For "do you have experience with / are you familiar with / are you proficient in" questions, answer Yes.
- For multiple-choice experience ranges, pick the highest range the candidate can credibly support — never "None" and never the bottom bucket.${capLine}

Always accurate — do NOT inflate these:
- Work authorization, visa/sponsorship needs, citizenship, residency
- Degrees, diplomas, licenses, certifications, security clearances
- Criminal record, background checks, drug screening, age
- Employers, job titles, and dates that appear on the resume
Answer those literally from the resume and preferences, since they are legal attestations and a false answer gets the offer pulled.

Format:
- Be concise and direct
- Match the expected input format exactly
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
