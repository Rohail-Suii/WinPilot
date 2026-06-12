import type { AIMessage } from "../provider";
import type { IProfileSnapshot } from "@/lib/db/models/linkedin-job-optimization";

export function buildLinkedInJobOptimizerPrompt(
  profileData: Partial<IProfileSnapshot>,
  jobDescription: string
): AIMessage[] {
  const experienceText =
    profileData.experience?.length
      ? profileData.experience
          .map(
            (e) =>
              `- ${e.title} at ${e.company}${e.duration ? ` (${e.duration})` : ""}\n  ${e.description || ""}`.trim()
          )
          .join("\n")
      : "Not provided";

  const educationText =
    profileData.education?.length
      ? profileData.education
          .map((e) => `- ${e.degree}${e.field ? ` in ${e.field}` : ""} from ${e.school}`)
          .join("\n")
      : "Not provided";

  const certificationsText =
    profileData.certifications?.length
      ? profileData.certifications
          .map((c) => `- ${c.name} (${c.issuingOrg})`)
          .join("\n")
      : "None listed";

  const featuredText =
    profileData.featured?.length
      ? profileData.featured.map((f) => `- ${f.type}: ${f.title}`).join("\n")
      : "None listed";

  return [
    {
      role: "system",
      content: `You are an expert LinkedIn career coach, ATS optimization specialist, and technical recruiter. Your goal is to analyze a LinkedIn profile against a target job description and provide a comprehensive, actionable optimization plan.

Guidelines:
- Be specific and actionable — generic advice is useless
- Think like an ATS scanner AND a human recruiter
- Identify exact keyword gaps between the profile and the job description
- For post ideas, suggest content that demonstrates expertise relevant to the target role
- For certificates, only recommend widely recognized, respected certifications (Coursera, LinkedIn Learning, AWS, Google, etc.)
- For featured section, prioritize items that directly signal fit for the target role
- Be honest: if the profile is a poor fit, say so clearly in the overallFit score
- Post ideas should be realistic to write (not requiring deep insider knowledge)

Respond with valid JSON only. Schema:
{
  "overallFit": number (0-100, how well current profile fits the job),
  "targetRole": "string (extracted role title from job description)",
  "headline": {
    "current": "string",
    "recommended": "string (under 220 chars, keyword-rich, ATS-optimized)",
    "keywords": ["string (key terms extracted from JD)"],
    "reasoning": "string"
  },
  "about": {
    "current": "string",
    "recommended": "string (200-400 words, hook + value prop + CTA, uses JD keywords naturally)",
    "keyChanges": ["string (bullet: what changed and why)"]
  },
  "skillsGap": {
    "have": ["string (skills in profile that match JD)"],
    "missing": ["string (skills in JD not on profile — add these)"],
    "quickWins": ["string (skills you likely have but haven't listed — easy to add)"]
  },
  "postIdeas": [
    {
      "topic": "string",
      "angle": "string (unique perspective or hook)",
      "type": "story|listicle|opinion|tip|question|case-study",
      "hashtags": ["string"],
      "whyItHelps": "string (how this post signals fit for the target role)"
    }
  ],
  "certificates": [
    {
      "name": "string",
      "provider": "string",
      "relevance": "string (why this cert matters for the target role)",
      "url": "string (optional direct URL to course/cert)"
    }
  ],
  "featuredSuggestions": [
    {
      "type": "project|article|post|media|link",
      "description": "string (what to feature and why)",
      "priority": "high|medium|low"
    }
  ]
}`,
    },
    {
      role: "user",
      content: `## LinkedIn Profile

**Headline:** ${profileData.headline || "Not provided"}

**About/Summary:**
${profileData.about || "Not provided"}

**Skills:** ${profileData.skills?.join(", ") || "Not provided"}

**Experience:**
${experienceText}

**Education:**
${educationText}

**Certifications:**
${certificationsText}

**Featured Section:**
${featuredText}

---

## Target Job Description

${jobDescription}

---

Analyze this LinkedIn profile against the job description. Identify gaps, generate 5 post ideas, recommend 3-5 relevant certifications, and suggest 3 featured section improvements. Return JSON only.`,
    },
  ];
}
