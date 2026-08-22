import type { AIMessage } from "../provider";

export type OutreachChannel = "hiring_team" | "company_page" | "connection";

export interface OutreachPromptInput {
  channel: OutreachChannel;
  jobTitle: string;
  company: string;
  /** Name of the person being messaged, when the channel has one. */
  recipientName?: string;
  recipientHeadline?: string;
  /** The applicant's own name, used to sign off. */
  senderName?: string;
  /** Condensed resume / career data for grounding the pitch. */
  senderBackground?: string;
  /** Trimmed job description, so the message can name a real requirement. */
  jobDescription?: string;
}

const CHANNEL_BRIEF: Record<OutreachChannel, string> = {
  hiring_team:
    "You are messaging the person listed on the job post as part of the hiring team. They already own this role, so be direct about the application.",
  company_page:
    "You are messaging the company's LinkedIn page through its Careers topic. A page admin or recruiter reads it, not the hiring manager — keep it short and easy to route.",
  connection:
    "You are messaging an existing connection who works at the company. Ask lightly whether they can point the application to the right person; do not ask them to vouch for skills they have not seen.",
};

/**
 * Prompt for a short follow-up message sent right after applying to a job.
 * The LinkedIn message box is the target, so the output is plain text — no
 * subject line, no markdown, no placeholders for the sender to fill in.
 */
export function buildCompanyOutreachPrompt(input: OutreachPromptInput): AIMessage[] {
  const recipient = input.recipientName
    ? `${input.recipientName}${input.recipientHeadline ? ` (${input.recipientHeadline})` : ""}`
    : "the company's careers inbox";

  return [
    {
      role: "system",
      content: `You write short LinkedIn follow-up messages for a candidate who has just submitted an application.

${CHANNEL_BRIEF[input.channel]}

Rules:
- 90 words maximum, 2-4 short sentences
- Open by naming the exact role applied for
- Give ONE concrete reason this candidate fits, taken from their background — never invent experience, numbers, or employers
- Close with a low-pressure ask (a quick look at the application, or the right person to talk to)
- Plain text only: no subject line, no markdown, no bullet points, no emoji
- No placeholders like [Name] or [Company] — write the finished message
- Never claim a referral, a prior conversation, or a relationship that was not described
- Warm and professional; no flattery, no buzzwords, no "I am reaching out to you today"

Respond with valid JSON only. Schema:
{
  "message": "string (the finished message, max 90 words)",
  "personalizationPoint": "string (the fit reason you used)"
}`,
    },
    {
      role: "user",
      content: `Write the follow-up message.

Role applied for: ${input.jobTitle}
Company: ${input.company}
Recipient: ${recipient}
Sender: ${input.senderName || "the candidate"}

Sender background:
${(input.senderBackground || "Not provided").slice(0, 2000)}

Job description (excerpt):
${(input.jobDescription || "Not provided").slice(0, 1200)}

Return JSON only.`,
    },
  ];
}
