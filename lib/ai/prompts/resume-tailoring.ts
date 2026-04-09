import type { AIMessage } from "../provider";

export function buildResumeTailoringPrompt(
  resumeData: {
    summary: string;
    experience: { company: string; title: string; description: string; highlights: string[] }[];
    skills: string[];
    education: { school: string; degree: string; field: string }[];
  },
  jobDescription: string
): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert ATS-optimized resume writer and technical recruiter. Given a base resume and job description, produce a tailored version that maximizes role alignment and ATS match.

Rules:
- Tech Stack Swap: identify the core programming languages, frameworks, and tools required in the job description and rewrite the summary, skills, and highlights to reflect that stack.
- Mirror Requirements: rewrite responsibilities and positioning so they align with the role scope, level, and years-of-experience expectations in the job description.
- Maintain Business Impact: preserve measurable outcomes and business impact from the base resume (latency reduction, performance gains, scale, delivery impact), but attribute those outcomes to the target stack.
- ATS Keyword Optimization: extract exact keyword phrases from the job description (including soft skills like remote collaboration, async communication, ownership, stakeholder management) and weave them naturally into summary and highlights.
- Use strong action verbs and maintain a professional tone.
- Return plain text values only. Do not use Markdown formatting, headings, or emphasis markers such as **, __, #, or bullet syntax markers in field values.
- Only return values that fit the JSON schema below.
- Calculate a match score (0-100) with brief explanation.

Respond with valid JSON only. Schema:
{
  "tailoredSummary": "string",
  "tailoredSkills": ["string"],
  "tailoredHighlights": ["string"],
  "matchScore": number,
  "matchExplanation": "string",
  "keywordsUsed": ["string"]
}`,
    },
    {
      role: "user",
      content: `## Current Resume

**Summary:** ${resumeData.summary}

**Skills:** ${resumeData.skills.join(", ")}

**Experience:**
${resumeData.experience
  .map(
    (exp) =>
      `- ${exp.title} at ${exp.company}\n  ${exp.description}\n  Highlights: ${exp.highlights.join("; ")}`
  )
  .join("\n")}

**Education:**
${resumeData.education.map((edu) => `- ${edu.degree} in ${edu.field} from ${edu.school}`).join("\n")}

---

## Job Description

${jobDescription}

---

Tailor my resume for this job. Return JSON only.`,
    },
  ];
}
