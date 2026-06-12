import { NextResponse } from "next/server";
import { getUserAIProvider } from "@/lib/ai/key-manager";
import { checkApiRateLimit } from "@/lib/utils/rate-limit";
import { getActorId } from "@/lib/utils/get-actor-id";

/**
 * AI Field Correction API Endpoint
 *
 * This endpoint receives validation error context from the browser extension
 * and uses AI to generate a corrected field value that will pass validation.
 */
export async function POST(req: Request) {
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
  const { prompt, context } = body;

  if (!context || !context.errorMessage) {
    return NextResponse.json(
      { error: "Context with error message is required" },
      { status: 400 }
    );
  }

  const ai = await getUserAIProvider(userId);
  if (!ai) {
    return NextResponse.json(
      { error: "No AI API key configured. Add one in Settings → AI Keys." },
      { status: 400 }
    );
  }

  try {
    console.log("[AI Field Correction] Processing:", {
      field: context.fieldLabel,
      error: context.errorMessage,
      currentValue: context.currentValue,
    });

    // Build messages for AI
    const messages = [
      {
        role: "system" as const,
        content:
          "You are a form validation expert. Your job is to fix field values that failed validation. " +
          "Always respond with valid JSON containing 'correctedValue' and 'reasoning' fields. " +
          "The correctedValue should be a string that will pass validation.",
      },
      {
        role: "user" as const,
        content: prompt || buildDefaultPrompt(context),
      },
    ];

    // Request AI correction
    const result = await ai.generateJSON(messages);

    // Validate response structure
    if (!result || typeof result !== "object") {
      throw new Error("AI returned invalid response format");
    }

    const response = result as {
      correctedValue?: string | number | boolean;
      reasoning?: string;
    };

    if (response.correctedValue === undefined) {
      throw new Error("AI did not return a correctedValue");
    }

    console.log("[AI Field Correction] Success:", {
      field: context.fieldLabel,
      originalValue: context.currentValue,
      correctedValue: response.correctedValue,
      reasoning: response.reasoning,
    });

    return NextResponse.json({
      correctedValue: response.correctedValue,
      reasoning: response.reasoning || "",
      success: true,
    });
  } catch (error) {
    console.error("[AI Field Correction] Failed:", error);
    const message = error instanceof Error ? error.message : "AI correction failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface FormFieldOption {
  text: string;
  value: string;
}

interface FormFieldContext {
  fieldLabel: string;
  fieldType: string;
  currentValue: string;
  errorMessage: string;
  placeholder?: string;
  hint?: string;
  options?: FormFieldOption[];
  pattern?: string;
  min?: number | string;
  max?: number | string;
  minLength?: number;
  maxLength?: number;
}

/**
 * Build default prompt if none provided by client
 */
function buildDefaultPrompt(context: FormFieldContext): string {
  const {
    fieldLabel,
    fieldType,
    currentValue,
    errorMessage,
    placeholder,
    hint,
    options,
    pattern,
    min,
    max,
    minLength,
    maxLength,
  } = context;

  let prompt = `You are a form-filling assistant. A form validation error occurred and you need to fix it.\n\n`;
  prompt += `**Field Information:**\n`;
  prompt += `- Label: "${fieldLabel}"\n`;
  prompt += `- Type: ${fieldType}\n`;
  prompt += `- Current Value: "${currentValue}"\n`;
  prompt += `- Error Message: "${errorMessage}"\n\n`;

  if (placeholder) prompt += `- Placeholder: "${placeholder}"\n`;
  if (hint) prompt += `- Hint: "${hint}"\n`;
  if (pattern) prompt += `- Pattern (regex): ${pattern}\n`;
  if (min) prompt += `- Min: ${min}\n`;
  if (max) prompt += `- Max: ${max}\n`;
  if (minLength) prompt += `- Min Length: ${minLength}\n`;
  if (maxLength) prompt += `- Max Length: ${maxLength}\n`;

  if (options && options.length > 0) {
    prompt += `\n**Available Options:**\n`;
    options.slice(0, 20).forEach((opt: FormFieldOption, idx: number) => {
      prompt += `${idx + 1}. "${opt.text}" (value: "${opt.value}")\n`;
    });
    if (options.length > 20) {
      prompt += `... and ${options.length - 20} more options\n`;
    }
  }

  prompt += `\n**Task:**\n`;
  prompt += `Based on the error message and field requirements, provide a corrected value that will pass validation.\n\n`;

  prompt += `**Examples of common fixes:**\n`;
  prompt += `- If error is "Please enter a valid number" and value is "5,00,000" → remove commas → "500000"\n`;
  prompt += `- If error is "Please select an option" → select the first valid option from the list\n`;
  prompt += `- If error is "Phone number must be 10 digits" and value has formatting → extract just digits\n`;
  prompt += `- If error is "Date format must be MM/DD/YYYY" → reformat the date\n`;
  prompt += `- If error is "Invalid email format" → correct email syntax\n`;
  prompt += `- If value exceeds max length → truncate to max length\n`;
  prompt += `- If numeric value outside range → clamp to min/max\n\n`;

  prompt += `**Response Format:**\n`;
  prompt += `Return ONLY a JSON object with this structure:\n`;
  prompt += `{\n`;
  prompt += `  "correctedValue": "the fixed value as a string",\n`;
  prompt += `  "reasoning": "brief explanation of what was fixed"\n`;
  prompt += `}\n\n`;

  prompt += `Return ONLY the JSON object, no other text.`;

  return prompt;
}
