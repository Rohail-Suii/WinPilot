import type { AIMessage } from "../provider";

export type ResumeTailoringSource = "resume" | "data";

export interface ResumeTailoringInput {
  summary: string;
  experience: {
    company: string;
    title: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description: string;
    highlights: string[];
  }[];
  skills: string[];
  education: { school: string; degree: string; field: string }[];
  certifications?: { name: string; issuer: string; date?: string }[];
  projects?: { name: string; description: string; tech: string[]; url?: string }[];
  /** Original pasted document — preferred when source=resume */
  rawText?: string;
}

function sourceModeInstructions(source: ResumeTailoringSource): string {
  if (source === "data") {
    return `## GENERATION MODE: CAREER DATA BANK (source=data)
You are building this resume primarily from the candidate's STRUCTURED CAREER DATA:
experience entries, projects, skills, education, certifications — treated as a raw talent bank.

Goals in this mode:
- Rebuild the resume as if the candidate already operates in the TARGET ROLE (e.g. AI Engineer, Mobile Developer, Growth Marketing Manager)
- Remix experience + projects aggressively to surface role-relevant work; de-emphasize unrelated responsibilities
- Reorder highlights so the strongest JD-aligned proof points appear first
- Expand transferable work into target-domain language (without inventing employers, dates, degrees, or fake jobs)
- Write like a specialized operator in that domain (terminology, metrics, tools stack from the JD)
- Prefer projects when they prove the target stack better than older jobs
- Produce a complete, role-native resume — not a light edit of an old doc`;
  }

  return `## GENERATION MODE: BASE RESUME DOCUMENT (source=resume)
You are building this resume primarily from the candidate's UPLOADED/PARSED RESUME DOCUMENT
(raw resume text + structured fields). Preserve narrative continuity with their written resume.

Goals in this mode:
- Keep the story recognizable as "their" resume (same companies, same general career arc)
- Optimize wording, bullets, summary, and skills for the target JD / ATS keywords
- Elevate impact language and keyword coverage without a full role-pivot rewrite
- Prefer improvements that a human scanning both docs would still see as the same career`;
}

export function buildResumeTailoringPrompt(
  resumeData: ResumeTailoringInput,
  jobDescription: string,
  customPrompt?: string,
  source: ResumeTailoringSource = "resume"
): AIMessage[] {
  const customInstructions = customPrompt?.trim()
    ? `\n\n## ADDITIONAL USER INSTRUCTIONS (highest priority after truthfulness of employment facts)\n${customPrompt.trim()}`
    : "";

  const experienceBlock =
    resumeData.experience.length > 0
      ? resumeData.experience
          .map((exp) => {
            const dates = [exp.startDate, exp.current ? "Present" : exp.endDate]
              .filter(Boolean)
              .join(" – ");
            const bullets =
              exp.highlights?.length > 0
                ? exp.highlights.map((h) => `  - ${h}`).join("\n")
                : "  - (no highlights)";
            return `### ${exp.title} @ ${exp.company}${dates ? ` (${dates})` : ""}\n${exp.description || ""}\nAchievements:\n${bullets}`;
          })
          .join("\n\n")
      : "(No experience listed)";

  const projectsBlock =
    resumeData.projects && resumeData.projects.length > 0
      ? resumeData.projects
          .map(
            (p) =>
              `### ${p.name}\n${p.description || ""}\nTech: ${(p.tech || []).join(", ") || "n/a"}${
                p.url ? `\nURL: ${p.url}` : ""
              }`
          )
          .join("\n\n")
      : "(No projects listed)";

  const certsBlock =
    resumeData.certifications && resumeData.certifications.length > 0
      ? resumeData.certifications
          .map((c) => `- ${c.name} — ${c.issuer}${c.date ? ` (${c.date})` : ""}`)
          .join("\n")
      : "(No certifications listed)";

  const educationBlock =
    resumeData.education.length > 0
      ? resumeData.education
          .map((edu) => `- ${edu.degree} in ${edu.field} — ${edu.school}`)
          .join("\n")
      : "(No education listed)";

  const rawBlock =
    resumeData.rawText?.trim()
      ? `\n**Original Resume Document (raw text):**\n${resumeData.rawText.trim().slice(0, 12000)}\n`
      : "";

  return [
    {
      role: "system",
      content: `You are an elite career-positioning strategist and ATS resume architect. You create job-winning resumes that read as if the candidate was built for that exact role.

${sourceModeInstructions(source)}

## ROLE MORPHING (CRITICAL)
1. Detect the TARGET ROLE family from the JD, for example:
   - AI / ML / LLM / Data Science
   - Full-stack / Backend / Frontend web
   - Mobile (iOS / Android / React Native / Flutter)
   - DevOps / Cloud / SRE
   - Product / Project management
   - Marketing / Growth / Content / SEO
   - Sales / SDR / Account Executive
   - Design / UX
   - Security / QA / other specialty
2. Rebuild language so the resume sells that identity hard:
   - Title framing in summary: lead with the target job title (or closest honest senior title)
   - Skills section owned by that role's keyword universe
   - Bullets emphasize tools, outcomes, and verbs recruiters for that role scan for
3. Cross-domain candidates: map adjacent work into the target domain
   - Example: backend APIs → "production AI services/API backends for model-serving" when JD is AI engineering AND the candidate had relevant backend depth
   - Example: content + analytics → "growth content systems, funnel metrics, SEO experiments" when JD is marketing
   - Do this aggressively — this is the product value — but never invent employers, titles that claim a role the person never held at that company, degrees, or fake employment history

## AMPLIFICATION (ALLOWED "EXAGGERATION")
Allowed and expected:
- Stronger impact phrasing (owned outcomes, scale, speed, quality)
- Amplifying real metrics and scope when the base resume is understated
- Injecting exact JD keywords and stack names where transferable skill exists
- Rewriting titles in the *summary/headlines sense* (e.g. "Software Engineer specializing in ML infrastructure") without changing employer names or employment dates
- Elevating project descriptions so they prove target-role competencies
- Preferred phrasing density for ATS: critical JD keywords appear naturally 2–4 times across sections

Not allowed:
- Fake companies, fake jobs, fake degrees, fake certifications
- Claiming years of experience with a specific tool the person clearly never touched with zero adjacent foundation
- Pure keyword spam with no supporting proof in experience/projects

## SECTION BLUEPRINT
### Summary (3–4 sentences)
- Sentence 1: Target title + years/scope + primary stack from JD
- Sentence 2: Strongest quantified achievement aligned to JD
- Sentence 3: Domain differentiator (scale, leadership, niche)
- Pack 6–10 exact JD keyword phrases naturally

### Skills (12–20)
- Exact JD terminology; ordered by JD priority
- Blend hard tech/tools + role-critical soft skills only if JD values them

### Experience (rewrite EVERY role's bullets)
- Keep company names and date windows truthful
- 3–6 high-impact bullets per role, STAR-style, impact-first
- Lead bullets that prove JD requirements
- Mirror JD action verbs (architect, ship, own, scale, automate, etc.)

### Projects (rewrite for role fit)
- Reframe project outcomes and tech tags toward JD stack
- Prioritize projects that best sell the target role

## OUTPUT RULES
- Plain text values only — no Markdown (**bold**, # headers, bullet symbols in strings)
- Every bullet is a complete impact sentence
- Be ambitious on positioning; be honest on employment facts
- matchScore = realistic ATS fit after your rewrite (don't always give 99)
- keywordsUsed = exact phrases from the JD you successfully embedded
- detectedRole = short role label you optimized for (e.g. "AI Engineer", "Mobile Developer")${customInstructions}

Respond with valid JSON only:
{
  "detectedRole": "string",
  "tailoredSummary": "string (3-4 sentences)",
  "tailoredSkills": ["string"],
  "tailoredHighlights": ["string (6-12 top resume-wide achievement bullets)"],
  "tailoredExperience": [
    {
      "company": "string (must match a real company from input)",
      "title": "string (may slightly reframe toward JD if still honest)",
      "description": "string",
      "highlights": ["string"]
    }
  ],
  "tailoredProjects": [
    {
      "name": "string",
      "description": "string",
      "tech": ["string"]
    }
  ],
  "matchScore": number,
  "matchExplanation": "string",
  "keywordsUsed": ["string"]
}`,
    },
    {
      role: "user",
      content: `## CANDIDATE SOURCE MODE: ${source.toUpperCase()}

**Professional Summary:**
${resumeData.summary || "(No summary provided)"}

**Technical / Professional Skills:**
${resumeData.skills.length > 0 ? resumeData.skills.join(", ") : "(No skills listed)"}

**Professional Experience:**
${experienceBlock}

**Projects:**
${projectsBlock}

**Education:**
${educationBlock}

**Certifications:**
${certsBlock}
${rawBlock}
---

## TARGET JOB DESCRIPTION

${jobDescription}

---

Detect the target role family, then rewrite a maximum-impact resume for THAT role using mode=${source}. Return JSON only.`,
    },
  ];
}
