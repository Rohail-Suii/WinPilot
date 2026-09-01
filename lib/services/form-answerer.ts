/**
 * Form Answerer Service
 * Answers job application form questions using AI + predefined answers.
 */

import { getUserAIProvider } from "@/lib/ai/key-manager";
import { buildFormAnswerPrompt, type FormAnswerFieldMeta } from "@/lib/ai/prompts/form-answer";
import { getDefaultResume, resumeToText } from "./resume-service";
import {
  applyOptimisticFloor,
  estimateCareerYears,
  resolveOptimismSettings,
  type ExperienceOptimismSettings,
} from "./experience-optimism";

export type FormPlatform = "linkedin" | "indeed";

/** Common questions with standard answers */
const COMMON_ANSWERS: Record<string, (prefs: Record<string, string>, platform: FormPlatform) => string> = {
  "are you authorized to work": (prefs) => prefs.workAuthorization || "Yes",
  "do you require visa sponsorship": (prefs) => prefs.visaSponsorship || "No",
  "do you require sponsorship": (prefs) => prefs.visaSponsorship || "No",
  "willing to relocate": (prefs) => prefs.willingToRelocate || "Yes",
  "what is your expected salary": (prefs) => prefs.expectedSalary || "",
  "desired salary": (prefs) => prefs.expectedSalary || "",
  "salary expectations": (prefs) => prefs.expectedSalary || "",
  "current salary": (prefs) => prefs.currentSalary || prefs.expectedSalary || "",
  "how did you hear about": (_prefs, platform) => (platform === "indeed" ? "Indeed" : "LinkedIn"),
  "start date": (prefs) => prefs.startDate || "Immediately",
  "notice period": (prefs) => prefs.noticePeriod || "2 weeks",
  "are you 18 years or older": () => "Yes",
  "are you at least 18": () => "Yes",
  "do you have a valid driver": (prefs) => prefs.driversLicense || "Yes",
  "gender": (prefs) => prefs.gender || "Prefer not to say",
  "race": () => "Prefer not to say",
  "ethnicity": () => "Prefer not to say",
  "veteran": (prefs) => prefs.veteranStatus || "No",
  "disability": (prefs) => prefs.disabilityStatus || "Prefer not to say",
  "bachelor": (prefs) => prefs.hasBachelors || "Yes",
  "master's degree": (prefs) => prefs.hasMasters || "No",
  "masters degree": (prefs) => prefs.hasMasters || "No",
};

export interface FormQuestionInput {
  question: string;
  fieldType: string;
  options?: string[];
  maxLength?: number;
  expectedFormat?: FormAnswerFieldMeta["expectedFormat"];
}

export interface FormAnswer {
  answer: string;
  confidence: number;
  source: "predefined" | "ai" | "fallback";
}

function inferExpectedFormat(
  question: string,
  fieldType: string,
  options?: string[]
): FormAnswerFieldMeta["expectedFormat"] {
  const q = question.toLowerCase();
  if (fieldType === "radio" || fieldType === "select" || fieldType === "custom-dropdown") {
    if (options && options.length <= 4 && options.some((o) => /^(yes|no)$/i.test(o.trim()))) {
      return "yes_no";
    }
    return "text";
  }
  if (fieldType === "textarea") return "long_text";
  if (/salary|compensation|pay|ctc|stipend/i.test(q)) return "currency";
  if (/how many|years of|year of|experience|scale of|gpa|age|phone|zip|postal/i.test(q)) {
    return "digits";
  }
  return "unknown";
}

function pickMatchingOption(answer: string, options?: string[]): string {
  if (!options?.length || !answer) return answer;
  const normalized = answer.trim().toLowerCase();
  const exact = options.find((o) => o.trim().toLowerCase() === normalized);
  if (exact) return exact;
  const partial = options.find(
    (o) =>
      o.trim().toLowerCase().includes(normalized) ||
      normalized.includes(o.trim().toLowerCase())
  );
  return partial || answer;
}

function formatAnswerForField(
  raw: string,
  question: string,
  fieldType: string,
  options?: string[],
  maxLength?: number,
  expectedFormat?: FormAnswerFieldMeta["expectedFormat"]
): string {
  let answer = (raw || "").trim();
  if (!answer) return "";

  const format = expectedFormat || inferExpectedFormat(question, fieldType, options);

  if (format === "yes_no" || fieldType === "radio" || fieldType === "select" || fieldType === "custom-dropdown") {
    answer = pickMatchingOption(answer, options);
  }

  if (format === "digits") {
    const digits = answer.replace(/[^\d]/g, "");
    if (digits) answer = digits;
  } else if (format === "currency" || format === "decimal") {
    const num = answer.replace(/[^\d.]/g, "");
    if (num) answer = num;
  }

  if (typeof maxLength === "number" && maxLength > 0 && answer.length > maxLength) {
    answer = answer.slice(0, maxLength).trim();
  }

  return answer;
}

interface AnswerContext {
  resumeContext: string;
  optimism: ExperienceOptimismSettings;
}

/**
 * Load resume text + the optimism floors once per batch. The floors are capped
 * by the candidate's real career length so answers stay credible.
 */
async function loadAnswerContext(
  userId: string,
  userPreferences: Record<string, string>
): Promise<AnswerContext> {
  const resume = await getDefaultResume(userId);
  return {
    resumeContext: resume ? resumeToText(resume) : "",
    optimism: resolveOptimismSettings(
      userPreferences,
      estimateCareerYears(resume?.experience)
    ),
  };
}

/**
 * Used when AI is unavailable. An empty answer leaves the field blank (or lets
 * the extension fall back to a literal zero), so answer experience questions
 * positively even here.
 */
function fallbackAnswer(
  question: string,
  fieldType: string,
  options: string[] | undefined,
  maxLength: number | undefined,
  expectedFormat: FormAnswerFieldMeta["expectedFormat"],
  userPreferences: Record<string, string>
): FormAnswer {
  const settings = resolveOptimismSettings(userPreferences);
  const optimistic = applyOptimisticFloor({
    question,
    answer: "",
    expectedFormat,
    fieldType,
    options,
    settings,
  });
  if (!optimistic) return { answer: "", confidence: 0, source: "fallback" };
  return {
    answer: formatAnswerForField(optimistic, question, fieldType, options, maxLength, expectedFormat),
    confidence: 40,
    source: "fallback",
  };
}

/**
 * Answer a single form question
 */
export async function answerFormQuestion(
  userId: string,
  question: string,
  userPreferences: Record<string, string> = {},
  fieldMeta: FormAnswerFieldMeta = {},
  platform: FormPlatform = "linkedin",
  preloaded?: AnswerContext
): Promise<FormAnswer> {
  const questionLower = question.toLowerCase().trim();
  const fieldType = fieldMeta.fieldType || "text";
  const options = fieldMeta.options;
  const maxLength = fieldMeta.maxLength;
  const expectedFormat =
    fieldMeta.expectedFormat || inferExpectedFormat(question, fieldType, options);

  // Check predefined answers first
  for (const [pattern, answerer] of Object.entries(COMMON_ANSWERS)) {
    if (questionLower.includes(pattern)) {
      const answer = answerer(userPreferences, platform);
      if (answer) {
        return {
          answer: formatAnswerForField(answer, question, fieldType, options, maxLength, expectedFormat),
          confidence: 95,
          source: "predefined",
        };
      }
    }
  }

  // Fall back to AI
  try {
    const ai = await getUserAIProvider(userId);
    if (!ai) {
      return fallbackAnswer(question, fieldType, options, maxLength, expectedFormat, userPreferences);
    }

    const context = preloaded || (await loadAnswerContext(userId, userPreferences));

    const messages = buildFormAnswerPrompt(
      question,
      context.resumeContext,
      userPreferences,
      {
        fieldType,
        options,
        maxLength,
        expectedFormat,
        platform,
      },
      context.optimism
    );
    const result = await ai.generateJSON<{ answer: string; confidence: number }>(messages);
    // Never let a screening filter see a zero — see experience-optimism.ts.
    const optimistic = applyOptimisticFloor({
      question,
      answer: result.answer || "",
      expectedFormat,
      fieldType,
      options,
      settings: context.optimism,
    });
    const answer = formatAnswerForField(
      optimistic,
      question,
      fieldType,
      options,
      maxLength,
      expectedFormat
    );

    return {
      answer,
      confidence: result.confidence || 50,
      source: "ai",
    };
  } catch {
    return fallbackAnswer(question, fieldType, options, maxLength, expectedFormat, userPreferences);
  }
}

/**
 * Answer multiple form questions at once
 */
export async function answerFormQuestions(
  userId: string,
  questions: FormQuestionInput[],
  userPreferences: Record<string, string> = {},
  platform: FormPlatform = "linkedin"
): Promise<{ question: string; fieldType: string; answer: FormAnswer }[]> {
  const results: { question: string; fieldType: string; answer: FormAnswer }[] = [];
  const aiNeeded: { index: number; input: FormQuestionInput }[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionLower = q.question.toLowerCase().trim();
    const expectedFormat =
      q.expectedFormat || inferExpectedFormat(q.question, q.fieldType, q.options);
    let found = false;

    for (const [pattern, answerer] of Object.entries(COMMON_ANSWERS)) {
      if (questionLower.includes(pattern)) {
        const answer = answerer(userPreferences, platform);
        if (answer) {
          results[i] = {
            question: q.question,
            fieldType: q.fieldType,
            answer: {
              answer: formatAnswerForField(
                answer,
                q.question,
                q.fieldType,
                q.options,
                q.maxLength,
                expectedFormat
              ),
              confidence: 95,
              source: "predefined",
            },
          };
          found = true;
          break;
        }
      }
    }

    if (!found) {
      aiNeeded.push({ index: i, input: q });
    }
  }

  // Process AI questions concurrently (batch of 3)
  if (aiNeeded.length > 0) {
    const context = await loadAnswerContext(userId, userPreferences);
    const CONCURRENCY = 3;
    for (let i = 0; i < aiNeeded.length; i += CONCURRENCY) {
      const batch = aiNeeded.slice(i, i + CONCURRENCY);
      const aiResults = await Promise.allSettled(
        batch.map((item) =>
          answerFormQuestion(
            userId,
            item.input.question,
            userPreferences,
            {
              fieldType: item.input.fieldType,
              options: item.input.options,
              maxLength: item.input.maxLength,
              expectedFormat: item.input.expectedFormat,
            },
            platform,
            context
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const result = aiResults[j];
        results[item.index] = {
          question: item.input.question,
          fieldType: item.input.fieldType,
          answer:
            result.status === "fulfilled"
              ? result.value
              : fallbackAnswer(
                  item.input.question,
                  item.input.fieldType,
                  item.input.options,
                  item.input.maxLength,
                  item.input.expectedFormat,
                  userPreferences
                ),
        };
      }
    }
  }

  return questions.map(
    (q, i) =>
      results[i] || {
        question: q.question,
        fieldType: q.fieldType,
        answer: fallbackAnswer(
          q.question,
          q.fieldType,
          q.options,
          q.maxLength,
          q.expectedFormat,
          userPreferences
        ),
      }
  );
}
