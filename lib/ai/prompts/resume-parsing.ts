import type { AIMessage } from "../provider";

export function buildResumeParsingPrompt(rawText: string): AIMessage[] {
  return [
    {
      role: "system",
      content: `You are an expert resume parser. Extract structured data from the raw resume text provided.

Respond with valid JSON only. Schema:
{
  "contactInfo": {
    "name": "string | null (the person's full name)",
    "phone": "string | null",
    "email": "string | null",
    "location": "string | null",
    "linkedin": "string | null",
    "github": "string | null",
    "portfolio": "string | null"
  },
  "summary": "string (professional summary, or empty string if not found)",
  "experience": [
    {
      "company": "string",
      "title": "string",
      "startDate": "string (MM/YYYY or YYYY)",
      "endDate": "string | null (MM/YYYY, YYYY, or null if current)",
      "current": boolean,
      "description": "string",
      "highlights": ["string"]
    }
  ],
  "education": [
    {
      "school": "string",
      "degree": "string",
      "field": "string",
      "startDate": "string | null",
      "endDate": "string | null",
      "gpa": "string | null"
    }
  ],
  "skills": ["string"],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string | null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "url": "string | null",
      "tech": ["string"]
    }
  ]
}

Rules:
- Extract everything you can find, leave null/empty for missing fields
- Normalize dates to MM/YYYY format when possible
- Separate skills into individual items
- Experience highlights should be achievement-oriented bullet points
- If summary is not explicit, synthesize one from the overall resume
- Also work well with free-form career dumps: LinkedIn profiles, notes, bios, bullet lists — not only formal resume formatting
- Capture projects, side work, freelance, and internships under experience or projects as appropriate`,
    },
    {
      role: "user",
      content: `Parse this resume / career text into structured JSON:\n\n${rawText}`,
    },
  ];
}
