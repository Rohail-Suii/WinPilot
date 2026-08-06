/**
 * Resume PDF Generator
 * Generates a tailored PDF resume from structured resume data + AI tailoring.
 * Returns a base64-encoded PDF string for upload via the extension.
 */

import PDFDocument from "pdfkit";
import { getDefaultResume } from "./resume-service";

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
}

interface TailoredData {
  summary?: string;
  skills?: string[];
  highlights?: string[];
  experience?: TailoredExperienceItem[];
  projects?: TailoredProjectItem[];
}

/**
 * Generate a PDF resume tailored for a specific job
 * Returns base64-encoded PDF content
 */
export async function generateTailoredResumePDF(
  userId: string,
  tailoredData: TailoredData
): Promise<{ base64: string; fileName: string }> {
  let resume = await getDefaultResume(userId);

  // Fall back to Career Profile so data-mode users can generate PDFs without a uploaded resume
  if (!resume) {
    const { getCareerProfile, careerProfileHasContent } = await import(
      "./career-profile"
    );
    const career = await getCareerProfile(userId);
    if (!careerProfileHasContent(career)) {
      throw new Error("No resume found");
    }
    resume = {
      contactInfo: career!.contactInfo || {},
      summary: career!.summary || "",
      experience: career!.experience || [],
      education: career!.education || [],
      skills: career!.skills || [],
      certifications: career!.certifications || [],
      projects: career!.projects || [],
    } as Awaited<ReturnType<typeof getDefaultResume>>;
  }

  if (!resume) {
    throw new Error("No resume found");
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 55, right: 55 },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve) => doc.on("end", resolve));

  // --- Header / Name ---
  const name =
    resume.contactInfo?.name ||
    resume.contactInfo?.email?.split("@")[0] ||
    "Applicant";
  const displayName = resume.contactInfo?.name
    ? name
    : name
        .replace(/[._-]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  doc.fontSize(22).font("Helvetica-Bold").text(displayName, { align: "center" });
  doc.moveDown(0.3);

  const contactParts: string[] = [];
  if (resume.contactInfo?.email) contactParts.push(resume.contactInfo.email);
  if (resume.contactInfo?.phone) contactParts.push(resume.contactInfo.phone);
  if (resume.contactInfo?.location) contactParts.push(resume.contactInfo.location);
  if (resume.contactInfo?.linkedin) contactParts.push(resume.contactInfo.linkedin);
  if (resume.contactInfo?.github) contactParts.push(resume.contactInfo.github);
  if (resume.contactInfo?.portfolio) contactParts.push(resume.contactInfo.portfolio);

  if (contactParts.length > 0) {
    doc.fontSize(9).font("Helvetica").text(contactParts.join("  |  "), { align: "center" });
  }

  doc.moveDown(0.8);

  // --- Summary ---
  const summary = tailoredData.summary || resume.summary;
  if (summary) {
    sectionHeader(doc, "PROFESSIONAL SUMMARY");
    doc.fontSize(10).font("Helvetica").text(summary, { lineGap: 2 });
    doc.moveDown(0.6);
  }

  // --- Skills ---
  const skills = tailoredData.skills?.length ? tailoredData.skills : resume.skills;
  if (skills?.length) {
    sectionHeader(doc, "SKILLS");
    doc.fontSize(10).font("Helvetica").text(skills.join("  |  "), { lineGap: 2 });
    doc.moveDown(0.6);
  }

  // --- Experience (prefer full AI rewrite when available) ---
  const tailoredExp = tailoredData.experience?.length ? tailoredData.experience : null;
  if (tailoredExp) {
    sectionHeader(doc, "EXPERIENCE");
    for (const exp of tailoredExp) {
      const title = exp.title || "Role";
      const company = exp.company || "";
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(title, { continued: !!company })
        .font("Helvetica")
        .text(company ? `  —  ${company}` : "");

      // Preserve dates from matching base experience when possible
      const baseMatch = resume.experience?.find(
        (b) =>
          b.company?.toLowerCase() === (company || "").toLowerCase() ||
          b.title?.toLowerCase() === (title || "").toLowerCase()
      );
      if (baseMatch) {
        const dates = [baseMatch.startDate, baseMatch.current ? "Present" : baseMatch.endDate]
          .filter(Boolean)
          .join(" – ");
        if (dates) doc.fontSize(9).font("Helvetica-Oblique").text(dates);
      }

      if (exp.description) {
        doc.fontSize(10).font("Helvetica").text(exp.description, { lineGap: 1 });
      }
      if (exp.highlights?.length) {
        for (const h of exp.highlights) {
          doc.fontSize(10).font("Helvetica").text(`  •  ${h}`, { indent: 10, lineGap: 1 });
        }
      }
      doc.moveDown(0.4);
    }
  } else if (resume.experience?.length) {
    sectionHeader(doc, "EXPERIENCE");
    for (const exp of resume.experience) {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(exp.title, { continued: true })
        .font("Helvetica")
        .text(`  —  ${exp.company}`);

      const dates = [exp.startDate, exp.current ? "Present" : exp.endDate]
        .filter(Boolean)
        .join(" – ");
      if (dates) {
        doc.fontSize(9).font("Helvetica-Oblique").text(dates);
      }

      if (exp.description) {
        doc.fontSize(10).font("Helvetica").text(exp.description, { lineGap: 1 });
      }

      const highlights =
        tailoredData.highlights?.length && resume.experience.indexOf(exp) === 0
          ? tailoredData.highlights
          : exp.highlights;

      if (highlights?.length) {
        for (const h of highlights) {
          doc.fontSize(10).font("Helvetica").text(`  •  ${h}`, { indent: 10, lineGap: 1 });
        }
      }
      doc.moveDown(0.4);
    }
  }

  // --- Projects ---
  const tailoredProjects = tailoredData.projects?.length ? tailoredData.projects : null;
  if (tailoredProjects) {
    sectionHeader(doc, "PROJECTS");
    for (const proj of tailoredProjects) {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(proj.name || "Project", { continued: !!(proj.tech && proj.tech.length) })
        .font("Helvetica")
        .text(proj.tech?.length ? `  [${proj.tech.join(", ")}]` : "");
      if (proj.description) {
        doc.fontSize(10).font("Helvetica").text(proj.description, { lineGap: 1 });
      }
      doc.moveDown(0.3);
    }
  } else if (resume.projects?.length) {
    sectionHeader(doc, "PROJECTS");
    for (const proj of resume.projects) {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(proj.name, { continued: true })
        .font("Helvetica")
        .text(proj.tech?.length ? `  [${proj.tech.join(", ")}]` : "");
      doc.fontSize(10).font("Helvetica").text(proj.description, { lineGap: 1 });
      doc.moveDown(0.3);
    }
  }

  // --- Education ---
  if (resume.education?.length) {
    sectionHeader(doc, "EDUCATION");
    for (const edu of resume.education) {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`${edu.degree} in ${edu.field}`, { continued: true })
        .font("Helvetica")
        .text(`  —  ${edu.school}`);

      const dates = [edu.startDate, edu.endDate].filter(Boolean).join(" – ");
      if (dates) {
        doc.fontSize(9).font("Helvetica-Oblique").text(dates);
      }
      if (edu.gpa) {
        doc.fontSize(10).font("Helvetica").text(`GPA: ${edu.gpa}`);
      }
      doc.moveDown(0.3);
    }
  }

  // --- Certifications ---
  if (resume.certifications?.length) {
    sectionHeader(doc, "CERTIFICATIONS");
    for (const cert of resume.certifications) {
      doc.fontSize(10).font("Helvetica").text(`${cert.name} — ${cert.issuer}`);
    }
    doc.moveDown(0.4);
  }

  doc.end();
  await finished;

  const pdfBuffer = Buffer.concat(chunks);
  const base64 = pdfBuffer.toString("base64");

  const safeName = displayName.replace(/\s+/g, "_");
  const fileName = `${safeName}_Resume.pdf`;

  return { base64, fileName };
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.fontSize(11).font("Helvetica-Bold").text(title);
  doc
    .moveTo(doc.x, doc.y + 2)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
    .strokeColor("#333333")
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.4);
}
