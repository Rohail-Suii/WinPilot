/**
 * Resume PDF Generator
 * Generates a tailored PDF resume from structured resume data + AI tailoring.
 * Returns a base64-encoded PDF string for upload via the extension.
 *
 * Layout goals: single-column (ATS-safe), consistent vertical rhythm, dates
 * right-aligned on the entry line, hanging-indent bullets, and no orphaned
 * section headers at a page break.
 */

import PDFDocument from "pdfkit";
import { getDefaultResume } from "./resume-service";
import { isWeakEmployerLabel } from "@/lib/utils";

interface TailoredExperienceItem {
  company?: string;
  title?: string;
  description?: string;
  highlights?: string[];
}

interface TailoredProjectItem {
  name?: string;
  description?: string;
  tech?: string[];
  /** Live product URL — printed as readable text and attached as a real link. */
  url?: string;
}

interface TailoredSkillGroup {
  category?: string;
  items?: string[];
}

interface TailoredData {
  summary?: string;
  skills?: string[];
  /** AI-chosen skill categories; falls back to the static categorizer when absent. */
  skillGroups?: TailoredSkillGroup[];
  highlights?: string[];
  experience?: TailoredExperienceItem[];
  projects?: TailoredProjectItem[];
}

type ResumeBase = Awaited<ReturnType<typeof getDefaultResume>>;
type Doc = PDFKit.PDFDocument;

/**
 * Recruiters and ATS both prefer one page, so the document is rendered
 * repeatedly against progressively tighter content budgets until it fits.
 * Only content is trimmed — body text never drops below 9.5pt and margins
 * never tighten below ~17mm, because that is where ATS parsing and human
 * readability start to suffer. The tailoring prompt orders bullets and entries
 * strongest-first, so trimming from the tail preserves the highest-impact work.
 */
interface Density {
  maxExperienceEntries: number;
  maxBulletsPerRole: number;
  maxProjects: number;
  /** Multiplier applied to the vertical rhythm (section/entry gaps). */
  spacing: number;
  /** Drop role description paragraphs, keeping only the achievement bullets. */
  dropRoleDescriptions: boolean;
}

const DENSITY_LADDER: Density[] = [
  { maxExperienceEntries: 5, maxBulletsPerRole: 5, maxProjects: 4, spacing: 1, dropRoleDescriptions: false },
  { maxExperienceEntries: 5, maxBulletsPerRole: 4, maxProjects: 3, spacing: 0.85, dropRoleDescriptions: false },
  { maxExperienceEntries: 4, maxBulletsPerRole: 4, maxProjects: 3, spacing: 0.7, dropRoleDescriptions: true },
  { maxExperienceEntries: 4, maxBulletsPerRole: 3, maxProjects: 2, spacing: 0.6, dropRoleDescriptions: true },
  { maxExperienceEntries: 3, maxBulletsPerRole: 3, maxProjects: 2, spacing: 0.5, dropRoleDescriptions: true },
];

const FONT = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  italic: "Helvetica-Oblique",
} as const;

const COLOR = {
  ink: "#111111", // names, section headers, entry titles
  body: "#262626", // paragraphs and bullets
  muted: "#5c5c5c", // dates, tech stacks, separators
  rule: "#bdbdbd", // section underlines
  link: "#1d4ed8",
} as const;

const SIZE = {
  name: 19,
  contact: 8.5,
  section: 9.5,
  entryTitle: 10.5,
  body: 9.5,
} as const;

const PAGE_MARGINS = { top: 44, bottom: 46, left: 50, right: 50 };

// ─── Geometry helpers ──────────────────────────────────────────────

const leftEdge = (doc: Doc) => doc.page.margins.left;
const rightEdge = (doc: Doc) => doc.page.width - doc.page.margins.right;
const usableWidth = (doc: Doc) => rightEdge(doc) - leftEdge(doc);
const bottomEdge = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/**
 * Break to a new page when `needed` points of vertical space aren't left.
 * Used to keep a section header (or an entry's first line) with its content.
 */
function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > bottomEdge(doc)) {
    doc.addPage();
    doc.x = leftEdge(doc);
  }
}

function gap(doc: Doc, points: number) {
  doc.y += points;
}

async function loadCareerProfileAsResume(userId: string): Promise<ResumeBase | null> {
  const { getCareerProfile, careerProfileHasContent } = await import("./career-profile");
  const career = await getCareerProfile(userId);
  if (!careerProfileHasContent(career)) return null;
  return {
    contactInfo: career!.contactInfo || {},
    summary: career!.summary || "",
    experience: career!.experience || [],
    education: career!.education || [],
    skills: career!.skills || [],
    certifications: career!.certifications || [],
    projects: career!.projects || [],
  } as ResumeBase;
}

/**
 * Career Data mode often has rich experience/projects but an empty contact
 * block or no education (users paste their work history and stop there).
 * Borrow those factual blocks from the uploaded resume so the header of the
 * generated PDF is never blank.
 */
function fillMissingFactsFrom(target: NonNullable<ResumeBase>, fallback: ResumeBase) {
  if (!fallback) return;

  const contact = target.contactInfo || {};
  const fallbackContact = fallback.contactInfo || {};
  const merged = { ...contact } as Record<string, unknown>;
  for (const [key, value] of Object.entries(fallbackContact)) {
    if (!merged[key] && value) merged[key] = value;
  }
  target.contactInfo = merged as typeof target.contactInfo;

  if (!target.education?.length && fallback.education?.length) {
    target.education = fallback.education;
  }
  if (!target.certifications?.length && fallback.certifications?.length) {
    target.certifications = fallback.certifications;
  }
}

/**
 * Generate a PDF resume tailored for a specific job
 * Returns base64-encoded PDF content
 */
export async function generateTailoredResumePDF(
  userId: string,
  tailoredData: TailoredData,
  source?: "resume" | "data"
): Promise<{ base64: string; fileName: string }> {
  // Career Data mode: build contact info / education / certifications from the
  // Career Profile bank so the PDF actually reflects what was tailored from,
  // instead of always defaulting to a stale uploaded resume document.
  const preferCareer = source === "data";
  let resume = preferCareer
    ? await loadCareerProfileAsResume(userId)
    : await getDefaultResume(userId);

  if (preferCareer && resume) {
    fillMissingFactsFrom(resume, await getDefaultResume(userId));
  }

  // Fall back the other direction if the preferred source has nothing usable
  if (!resume) {
    resume = preferCareer
      ? await getDefaultResume(userId)
      : await loadCareerProfileAsResume(userId);
  }

  if (!resume) {
    throw new Error("No resume found");
  }

  const rawName =
    resume.contactInfo?.name || resume.contactInfo?.email?.split("@")[0] || "Applicant";
  const displayName = resume.contactInfo?.name
    ? rawName
    : rawName.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Render at each budget until the resume lands on a single page; the last
  // (tightest) attempt is accepted as-is rather than cutting a whole role.
  let pdfBuffer: Buffer | null = null;
  for (const [index, density] of DENSITY_LADDER.entries()) {
    const attempt = await renderResumeDocument(resume, displayName, tailoredData, density);
    pdfBuffer = attempt.buffer;
    if (attempt.pageCount === 1 || index === DENSITY_LADDER.length - 1) break;
  }

  const base64 = pdfBuffer!.toString("base64");

  const safeName = displayName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_") || "Resume";
  const fileName = `${safeName}_Resume.pdf`;

  return { base64, fileName };
}

/** One full render pass at a given content budget. */
async function renderResumeDocument(
  resume: NonNullable<ResumeBase>,
  displayName: string,
  tailoredData: TailoredData,
  density: Density
): Promise<{ buffer: Buffer; pageCount: number }> {
  const doc = new PDFDocument({ size: "A4", margins: PAGE_MARGINS });

  const chunks: Buffer[] = [];
  let pageCount = 1;
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("pageAdded", () => {
    pageCount += 1;
  });
  const finished = new Promise<void>((resolve) => doc.on("end", resolve));

  // --- Header / Name ---
  doc
    .font(FONT.bold)
    .fontSize(SIZE.name)
    .fillColor(COLOR.ink)
    .text(displayName.toUpperCase(), leftEdge(doc), doc.y, {
      width: usableWidth(doc),
      align: "center",
      characterSpacing: 1.4,
    });

  gap(doc, 4);
  renderContactLine(doc, resume);
  gap(doc, 10 * density.spacing);

  // --- Professional Summary ---
  const summary = tailoredData.summary || resume.summary;
  if (summary?.trim()) {
    sectionHeader(doc, "Professional Summary");
    paragraph(doc, summary.trim());
    gap(doc, 8 * density.spacing);
  }

  // --- Skills (grouped plain-text lines — never a table, for ATS parsing) ---
  const skills = (tailoredData.skills?.length ? tailoredData.skills : resume.skills)?.filter(
    (s) => !!s?.trim()
  );
  const aiGroups = normalizeAiSkillGroups(tailoredData.skillGroups);
  if (aiGroups.length || skills?.length) {
    sectionHeader(doc, "Skills");
    renderGroupedSkills(doc, skills || [], aiGroups);
    gap(doc, 8 * density.spacing);
  }

  const tailoredExp = (tailoredData.experience?.length ? tailoredData.experience : null)?.slice(
    0,
    density.maxExperienceEntries
  );
  const tailoredProjects = (tailoredData.projects?.length ? tailoredData.projects : null)?.slice(
    0,
    density.maxProjects
  );

  // Thin-experience profiles (career switchers, juniors leaning on Career Data
  // projects) read stronger with Projects surfaced before a sparse Experience
  // section, rather than always forcing Experience first.
  const experienceEntryCount = tailoredExp?.length ?? resume.experience?.length ?? 0;
  const projectEntryCount = tailoredProjects?.length ?? resume.projects?.length ?? 0;
  const projectsFirst = experienceEntryCount <= 1 && projectEntryCount >= 2;

  const renderExperience = () =>
    renderExperienceSection(doc, resume, tailoredData, tailoredExp, density);
  const renderProjects = () => renderProjectsSection(doc, resume, tailoredProjects, density);

  if (projectsFirst) {
    renderProjects();
    renderExperience();
  } else {
    renderExperience();
    renderProjects();
  }

  renderEducationSection(doc, resume, density);
  renderCertificationsSection(doc, resume, density);

  doc.end();
  await finished;

  return { buffer: Buffer.concat(chunks), pageCount };
}

// ─── Section renderers ─────────────────────────────────────────────

function renderExperienceSection(
  doc: Doc,
  resume: NonNullable<ResumeBase>,
  tailoredData: TailoredData,
  tailoredExp: TailoredExperienceItem[] | null | undefined,
  density: Density
) {
  if (tailoredExp?.length) {
    sectionHeader(doc, "Experience");
    tailoredExp.forEach((exp, i) => {
      const title = exp.title?.trim() || "Role";
      const company = exp.company?.trim() || "";
      const baseMatch = findBaseExperience(resume, company, title);

      // "Freelance" as an employer reads as a gap filler; print the role and
      // its dates instead of advertising the arrangement.
      entryHeading(
        doc,
        title,
        isWeakEmployerLabel(company) ? "" : company,
        formatDateRange(baseMatch)
      );

      if (exp.description?.trim() && !density.dropRoleDescriptions) {
        paragraph(doc, exp.description.trim());
      }
      renderBullets(doc, exp.highlights, density);

      if (i < tailoredExp.length - 1) gap(doc, 6 * density.spacing);
    });
    gap(doc, 8 * density.spacing);
    return;
  }

  if (!resume.experience?.length) return;

  const entries = resume.experience.slice(0, density.maxExperienceEntries);
  sectionHeader(doc, "Experience");
  entries.forEach((exp, i) => {
    const company = exp.company?.trim() || "";
    entryHeading(
      doc,
      exp.title || "Role",
      isWeakEmployerLabel(company) ? "" : company,
      formatDateRange(exp)
    );

    if (exp.description?.trim() && !density.dropRoleDescriptions) {
      paragraph(doc, exp.description.trim());
    }

    // Tailored highlights only apply to the most recent role; older roles keep
    // whatever the parsed resume already had.
    const highlights =
      i === 0 && tailoredData.highlights?.length ? tailoredData.highlights : exp.highlights;
    renderBullets(doc, highlights, density);

    if (i < entries.length - 1) gap(doc, 6 * density.spacing);
  });
  gap(doc, 8 * density.spacing);
}

function renderProjectsSection(
  doc: Doc,
  resume: NonNullable<ResumeBase>,
  tailoredProjects: TailoredProjectItem[] | null | undefined,
  density: Density
) {
  const projects: TailoredProjectItem[] | undefined = tailoredProjects?.length
    ? tailoredProjects
    : resume.projects?.slice(0, density.maxProjects);

  if (!projects?.length) return;

  sectionHeader(doc, "Projects");
  projects.forEach((proj, i) => {
    const tech = proj.tech?.filter(Boolean) ?? [];
    entryHeading(doc, proj.name?.trim() || "Project", "", tech.length ? tech.join(" · ") : "");
    if (proj.description?.trim()) paragraph(doc, proj.description.trim());
    if (proj.url?.trim()) projectLink(doc, proj.url.trim());
    if (i < projects.length - 1) gap(doc, 5 * density.spacing);
  });
  gap(doc, 8 * density.spacing);
}

/**
 * A recruiter has to be able to reach the running product. The full URL is
 * printed as readable text (so it survives printing or a viewer that strips
 * annotations) and the same run carries the clickable link annotation.
 */
function projectLink(doc: Doc, url: string) {
  const href = normalizeUrl(url);
  ensureSpace(doc, 14);
  doc
    .font(FONT.regular)
    .fontSize(SIZE.contact)
    .fillColor(COLOR.link)
    .text(href, leftEdge(doc), doc.y, {
      width: usableWidth(doc),
      link: href,
      lineBreak: false,
    });
  doc.x = leftEdge(doc);
  doc.y += 1;
  doc.fillColor(COLOR.body);
}

function renderEducationSection(doc: Doc, resume: NonNullable<ResumeBase>, density: Density) {
  if (!resume.education?.length) return;

  sectionHeader(doc, "Education");
  resume.education.forEach((edu, i) => {
    entryHeading(doc, formatDegree(edu.degree, edu.field), edu.school || "", formatDateRange(edu));
    if (edu.gpa) {
      doc
        .font(FONT.regular)
        .fontSize(SIZE.body)
        .fillColor(COLOR.body)
        .text(`GPA: ${edu.gpa}`, leftEdge(doc), doc.y, { width: usableWidth(doc) });
    }
    if (i < resume.education!.length - 1) gap(doc, 5 * density.spacing);
  });
  gap(doc, 8 * density.spacing);
}

function renderCertificationsSection(doc: Doc, resume: NonNullable<ResumeBase>, density: Density) {
  if (!resume.certifications?.length) return;

  sectionHeader(doc, "Certifications");
  for (const cert of resume.certifications) {
    const name = cert.name?.trim();
    if (!name) continue;
    const detail = [cert.issuer, cert.date].filter(Boolean).join(" · ");
    bulletLine(doc, detail ? `${name} — ${detail}` : name);
  }
  gap(doc, 6 * density.spacing);
}

// ─── Text primitives ───────────────────────────────────────────────

function sectionHeader(doc: Doc, title: string) {
  // Reserve room for the header plus a first line of content so a header never
  // ends up stranded at the bottom of a page.
  ensureSpace(doc, 48);

  doc
    .font(FONT.bold)
    .fontSize(SIZE.section)
    .fillColor(COLOR.ink)
    .text(title.toUpperCase(), leftEdge(doc), doc.y, {
      width: usableWidth(doc),
      characterSpacing: 0.9,
    });

  const ruleY = doc.y + 2.5;
  doc
    .moveTo(leftEdge(doc), ruleY)
    .lineTo(rightEdge(doc), ruleY)
    .lineWidth(0.7)
    .strokeColor(COLOR.rule)
    .stroke();

  doc.x = leftEdge(doc);
  doc.y = ruleY + 6;
}

/**
 * Entry line: bold primary (role/project/degree), optional secondary
 * (company/school) on the same line, and a right-aligned meta column (dates or
 * tech stack) that shares the line instead of consuming one of its own.
 */
function entryHeading(doc: Doc, primary: string, secondary: string, meta: string) {
  ensureSpace(doc, 36);

  const startY = doc.y;
  const trimmedMeta = meta?.trim() || "";

  let metaWidth = 0;
  if (trimmedMeta) {
    doc.font(FONT.italic).fontSize(SIZE.contact);
    metaWidth = doc.widthOfString(trimmedMeta);
  }

  // A meta string too wide to share the line (a long tech stack) gets its own
  // muted line below instead of wrapping into the entry title.
  const metaOnOwnLine = metaWidth > usableWidth(doc) * 0.42;
  const inlineMetaWidth = metaOnOwnLine ? 0 : metaWidth;
  const textWidth = usableWidth(doc) - (inlineMetaWidth ? inlineMetaWidth + 12 : 0);

  doc
    .font(FONT.bold)
    .fontSize(SIZE.entryTitle)
    .fillColor(COLOR.ink)
    .text(primary, leftEdge(doc), startY, {
      width: textWidth,
      continued: !!secondary,
    });

  if (secondary) {
    doc
      .font(FONT.regular)
      .fontSize(SIZE.entryTitle)
      .fillColor(COLOR.body)
      .text(` — ${secondary}`, { width: textWidth });
  }

  let afterTextY = doc.y;

  if (trimmedMeta && !metaOnOwnLine) {
    doc
      .font(FONT.italic)
      .fontSize(SIZE.contact)
      .fillColor(COLOR.muted)
      .text(trimmedMeta, rightEdge(doc) - metaWidth, startY + 2, {
        width: metaWidth + 2,
        align: "right",
        lineBreak: false,
      });
  } else if (trimmedMeta) {
    doc
      .font(FONT.italic)
      .fontSize(SIZE.contact)
      .fillColor(COLOR.muted)
      .text(trimmedMeta, leftEdge(doc), afterTextY + 1, { width: usableWidth(doc) });
    afterTextY = doc.y;
  }

  doc.x = leftEdge(doc);
  doc.y = afterTextY + 1.5;
}

function paragraph(doc: Doc, text: string) {
  ensureSpace(doc, 18);
  doc
    .font(FONT.regular)
    .fontSize(SIZE.body)
    .fillColor(COLOR.body)
    .text(text, leftEdge(doc), doc.y, { width: usableWidth(doc), lineGap: 1.8, align: "left" });
  doc.x = leftEdge(doc);
  doc.y += 1.5;
}

function renderBullets(doc: Doc, highlights: string[] | undefined, density: Density) {
  const items = highlights?.filter((h) => !!h?.trim()).slice(0, density.maxBulletsPerRole);
  if (!items?.length) return;
  for (const item of items) bulletLine(doc, item.trim());
}

/** Bullet with a true hanging indent — wrapped lines align under the text, not the dot. */
function bulletLine(doc: Doc, text: string) {
  const INDENT = 12;
  ensureSpace(doc, 16);

  const y = doc.y;
  doc.font(FONT.regular).fontSize(SIZE.body).fillColor(COLOR.muted);
  doc.text("•", leftEdge(doc) + 2, y, { width: 8, lineBreak: false });

  doc.fillColor(COLOR.body);
  doc.text(text, leftEdge(doc) + INDENT, y, {
    width: usableWidth(doc) - INDENT,
    lineGap: 1.5,
    align: "left",
  });

  doc.x = leftEdge(doc);
  doc.y += 1.5;
}

// ─── Contact line ──────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Strip protocol/trailing slash so links read as "linkedin.com/in/x", not a raw URL. */
function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

function renderContactLine(doc: Doc, resume: NonNullable<ResumeBase>) {
  type ContactPart = { text: string; link?: string };
  const contact = resume.contactInfo;
  const parts: ContactPart[] = [];

  if (contact?.email) parts.push({ text: contact.email, link: `mailto:${contact.email}` });
  if (contact?.phone) parts.push({ text: contact.phone });
  if (contact?.location) parts.push({ text: contact.location });
  for (const url of [contact?.linkedin, contact?.github, contact?.portfolio]) {
    if (url) parts.push({ text: displayUrl(url), link: normalizeUrl(url) });
  }

  if (parts.length === 0) return;

  const SEPARATOR = "  |  ";
  doc.font(FONT.regular).fontSize(SIZE.contact);

  const sepWidth = doc.widthOfString(SEPARATOR);
  const maxWidth = usableWidth(doc);

  // Greedy-wrap the parts into centered rows so a long contact block becomes
  // two tidy lines instead of overflowing the margins.
  const rows: ContactPart[][] = [];
  let row: ContactPart[] = [];
  let rowWidth = 0;

  for (const part of parts) {
    const partWidth = doc.widthOfString(part.text);
    const addedWidth = row.length ? sepWidth + partWidth : partWidth;
    if (row.length && rowWidth + addedWidth > maxWidth) {
      rows.push(row);
      row = [part];
      rowWidth = partWidth;
    } else {
      row.push(part);
      rowWidth += addedWidth;
    }
  }
  if (row.length) rows.push(row);

  const lineHeight = doc.currentLineHeight();
  let y = doc.y;

  for (const currentRow of rows) {
    const totalWidth = currentRow.reduce(
      (acc, part, i) => acc + doc.widthOfString(part.text) + (i ? sepWidth : 0),
      0
    );
    let x = leftEdge(doc) + Math.max(0, (maxWidth - totalWidth) / 2);

    currentRow.forEach((part, i) => {
      if (i) {
        // An explicit width keeps each segment on one line and gives pdfkit the
        // measured run it needs to place link annotations.
        doc.fillColor(COLOR.rule).text(SEPARATOR, x, y, { width: sepWidth + 2, lineBreak: false });
        x += sepWidth;
      }
      const width = doc.widthOfString(part.text);
      doc
        .fillColor(part.link ? COLOR.link : COLOR.body)
        .text(part.text, x, y, { width: width + 2, lineBreak: false, link: part.link });
      x += width;
    });

    y += lineHeight + 1;
  }

  doc.x = leftEdge(doc);
  doc.y = y;
  doc.fillColor(COLOR.body);
}

// ─── Skills grouping ───────────────────────────────────────────────

// Static keyword → category lookup used to group a flat skills list for
// display. Unmatched skills fall into "Additional Skills" rather than being
// dropped, so nothing the AI/user entered silently disappears.
const SKILL_CATEGORIES: { label: string; keywords: string[] }[] = [
  {
    label: "Languages",
    keywords: [
      "javascript", "typescript", "python", "java", "c++", "c#", "go", "golang", "rust", "ruby",
      "php", "swift", "kotlin", "scala", "sql", "html", "css", "r", "dart", "objective-c",
    ],
  },
  {
    label: "Frameworks & Libraries",
    keywords: [
      "react", "react native", "next.js", "nextjs", "vue", "angular", "node", "node.js", "express",
      "django", "flask", "fastapi", "spring", "rails", ".net", "tensorflow", "pytorch", "redux",
      "svelte", "nestjs", "graphql", "tailwind", "bootstrap",
    ],
  },
  {
    label: "Cloud & DevOps",
    keywords: [
      "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "terraform", "jenkins",
      "github actions", "ci/cd", "cicd", "ansible", "linux", "nginx", "serverless",
    ],
  },
  {
    label: "Databases",
    keywords: [
      "postgres", "postgresql", "mysql", "mongodb", "redis", "dynamodb", "elasticsearch",
      "sqlite", "cassandra", "firebase", "supabase",
    ],
  },
  {
    label: "Product & Delivery",
    keywords: [
      "product management", "product strategy", "agile", "scrum", "kanban", "roadmap",
      "roadmaps", "stakeholder management", "backlog", "user stories", "prioritization",
      "okrs", "a/b testing", "product discovery", "sprint planning",
    ],
  },
  {
    label: "Tools & Platforms",
    keywords: [
      "git", "jira", "figma", "postman", "webpack", "vite", "confluence", "slack", "notion",
      "looker", "tableau", "amplitude", "mixpanel", "salesforce", "hubspot", "zendesk",
    ],
  },
];

/**
 * Whole-token match, not a bare substring test: `"r"` must not claim
 * "Product Management" and `"go"` must not claim "Google Analytics".
 */
function skillMatchesKeyword(skill: string, keyword: string): boolean {
  const base = skill.toLowerCase().replace(/[^a-z0-9+#./&-]+/g, " ").trim();
  const needle = ` ${keyword.toLowerCase()} `;
  // Two passes: one keeping "/" (so "ci/cd" stays intact) and one splitting on
  // it (so "Agile/Scrum Methodologies" still matches "agile").
  return (
    ` ${base} `.includes(needle) || ` ${base.replace(/\//g, " ")} `.includes(needle)
  );
}

export function categorizeSkills(skills: string[]): { label: string; items: string[] }[] {
  const buckets = SKILL_CATEGORIES.map((c) => ({ label: c.label, items: [] as string[] }));
  const other: string[] = [];

  for (const skill of skills) {
    const bucketIndex = SKILL_CATEGORIES.findIndex((c) =>
      c.keywords.some((k) => skillMatchesKeyword(skill, k))
    );
    if (bucketIndex >= 0) {
      buckets[bucketIndex].items.push(skill.trim());
    } else {
      other.push(skill.trim());
    }
  }

  const grouped = buckets.filter((b) => b.items.length > 0);

  if (other.length > 0) {
    const categorizedCount = grouped.reduce((n, b) => n + b.items.length, 0);
    if (grouped.length > 0 && other.length <= 2) {
      // A lone leftover skill next to real categories reads as noise — fold small
      // remainders into the largest category instead of creating a stub row.
      const largest = grouped.reduce((a, b) => (b.items.length > a.items.length ? b : a));
      largest.items.push(...other);
    } else if (other.length > categorizedCount) {
      // Non-engineering profiles (PM, support, ops) land mostly here — calling
      // the bulk of someone's skill set "Additional" undersells it.
      grouped.unshift({ label: "Core Competencies", items: other });
    } else {
      grouped.push({ label: "Additional Skills", items: other });
    }
  }

  return grouped;
}

/**
 * Prefer the categories the AI chose for this job (it knows the JD's vocabulary
 * and can name a "Payments" or "Testing" group the static map has no concept
 * of); fall back to the keyword categorizer when the model returns nothing
 * usable. Skills missing from the AI's groups are appended rather than dropped.
 */
export function normalizeAiSkillGroups(
  groups: TailoredSkillGroup[] | undefined
): { label: string; items: string[] }[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      label: group?.category?.trim() || "",
      items: (group?.items || []).map((item) => item?.trim()).filter((i): i is string => !!i),
    }))
    .filter((group) => !!group.label && group.items.length > 0);
}

function mergeUngroupedSkills(
  grouped: { label: string; items: string[] }[],
  skills: string[]
): { label: string; items: string[] }[] {
  const known = new Set(grouped.flatMap((g) => g.items).map((i) => i.toLowerCase()));
  const leftovers = skills.map((s) => s.trim()).filter((s) => s && !known.has(s.toLowerCase()));
  if (!leftovers.length) return grouped;

  const largest = grouped.reduce((a, b) => (b.items.length > a.items.length ? b : a));
  return grouped.map((g) =>
    g === largest ? { ...g, items: [...g.items, ...leftovers] } : g
  );
}

function renderGroupedSkills(
  doc: Doc,
  skills: string[],
  aiGroups: { label: string; items: string[] }[] = []
) {
  const grouped =
    aiGroups.length >= 2 ? mergeUngroupedSkills(aiGroups, skills) : categorizeSkills(skills);

  // Fewer than 2 categories isn't worth a categorized layout — a flat line reads cleaner.
  if (grouped.length < 2) {
    ensureSpace(doc, 18);
    doc
      .font(FONT.regular)
      .fontSize(SIZE.body)
      .fillColor(COLOR.body)
      .text(skills.join("  ·  "), leftEdge(doc), doc.y, {
        width: usableWidth(doc),
        lineGap: 2,
      });
    doc.x = leftEdge(doc);
    return;
  }

  // Align the value columns under a common left edge so the labels form a
  // clean gutter rather than ragged runs of bold text.
  doc.font(FONT.bold).fontSize(SIZE.body);
  const labelWidth =
    Math.min(
      Math.max(...grouped.map((g) => doc.widthOfString(`${g.label}: `))),
      usableWidth(doc) * 0.32
    ) + 4;

  for (const group of grouped) {
    ensureSpace(doc, 16);
    const y = doc.y;

    doc
      .font(FONT.bold)
      .fontSize(SIZE.body)
      .fillColor(COLOR.ink)
      .text(`${group.label}`, leftEdge(doc), y, { width: labelWidth, lineBreak: false });

    doc
      .font(FONT.regular)
      .fontSize(SIZE.body)
      .fillColor(COLOR.body)
      .text(group.items.join(", "), leftEdge(doc) + labelWidth, y, {
        width: usableWidth(doc) - labelWidth,
        lineGap: 2,
      });

    doc.x = leftEdge(doc);
    doc.y += 1.5;
  }
}

// ─── Small formatters ──────────────────────────────────────────────

/**
 * Resume dates are printed year-only ("2023", "2025 – Present"). Month-level
 * precision advertises exactly how short a short tenure was, and recruiters
 * screen on it; the year alone stays truthful without inviting that read.
 */
export function toYearOnly(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  const year = trimmed.match(/(?:19|20)\d{2}/);
  return year ? year[0] : trimmed;
}

export function formatDateRange(entry?: {
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean;
} | null): string {
  if (!entry) return "";
  const end = entry.current ? "Present" : toYearOnly(entry.endDate);
  const parts = [toYearOnly(entry.startDate), end].map((p) => p?.trim()).filter(Boolean);
  if (!parts.length) return "";
  return parts.length === 2 && parts[0] === parts[1] ? parts[0]! : parts.join(" – ");
}

/** "B.Sc. Computer Science" + field "Computer Science" must not print twice. */
export function formatDegree(degree?: string, field?: string): string {
  const d = degree?.trim() || "";
  const f = field?.trim() || "";
  if (!f) return d || "Education";
  if (!d) return f;
  if (d.toLowerCase().includes(f.toLowerCase())) return d;
  return `${d} in ${f}`;
}

/**
 * Match a tailored entry back to its parsed counterpart so real dates survive
 * the AI rewrite. Company+title is the confident match; a single-field match is
 * only accepted when it is unambiguous.
 */
function findBaseExperience(
  resume: NonNullable<ResumeBase>,
  company: string,
  title: string
) {
  const entries = resume.experience || [];
  if (!entries.length) return null;

  const c = company.toLowerCase();
  const t = title.toLowerCase();

  const exact = entries.find(
    (b) => b.company?.toLowerCase() === c && b.title?.toLowerCase() === t
  );
  if (exact) return exact;

  const byCompany = entries.filter((b) => c && b.company?.toLowerCase() === c);
  if (byCompany.length === 1) return byCompany[0];

  const byTitle = entries.filter((b) => t && b.title?.toLowerCase() === t);
  if (byTitle.length === 1) return byTitle[0];

  return null;
}
