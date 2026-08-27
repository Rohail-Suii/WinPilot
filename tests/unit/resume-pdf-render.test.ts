import { describe, it, expect, vi } from "vitest";

const baseResume = {
  contactInfo: {
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "+1 555 0100",
    location: "Austin, TX",
    linkedin: "linkedin.com/in/alexrivera",
  },
  summary: "Base summary.",
  experience: [
    {
      company: "Northwind Labs",
      title: "Senior Software Engineer",
      startDate: "03/2022",
      endDate: "",
      current: true,
      description: "",
      highlights: [],
    },
    {
      company: "Bluepeak",
      title: "Software Engineer",
      startDate: "06/2019",
      endDate: "02/2022",
      current: false,
      description: "",
      highlights: [],
    },
  ],
  education: [
    { school: "UT Austin", degree: "B.Sc.", field: "Computer Science", startDate: "2015", endDate: "2019" },
  ],
  skills: ["TypeScript", "React"],
  certifications: [],
  projects: [],
};

vi.mock("@/lib/services/resume-service", () => ({
  getDefaultResume: async () => baseResume,
  resumeToText: () => "",
}));

const { generateTailoredResumePDF } = await import("@/lib/services/resume-pdf");

/** pdfkit writes the page tree dictionary uncompressed, so /Count is readable. */
function pageCount(pdf: string): number {
  const match = pdf.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  return match ? Number(match[1]) : NaN;
}

const longBullet =
  "Built and shipped an event-driven billing pipeline in TypeScript and Node.js, replacing nightly batch reconciliation with streaming updates and cutting redundant API calls across the platform.";

const bigTailoredData = {
  summary:
    "Full-stack engineer who ships production web applications in React, Next.js, and Node.js. Owns features end to end, from schema design through deployment. Comfortable across payments integrations, background workers, and browser automation. Ships with tests and monitors what ships.",
  skills: ["TypeScript", "React", "Next.js", "Node.js", "Stripe", "PostgreSQL", "Docker"],
  skillGroups: [
    { category: "Frontend", items: ["React", "Next.js", "TypeScript"] },
    { category: "Backend", items: ["Node.js", "REST APIs"] },
    { category: "Payments", items: ["Stripe"] },
    { category: "Cloud & DevOps", items: ["Docker"] },
  ],
  highlights: [longBullet],
  experience: [
    {
      company: "Northwind Labs",
      title: "Senior Software Engineer",
      description: "Owned the billing and checkout surface area.",
      highlights: Array.from({ length: 6 }, () => longBullet),
    },
    {
      company: "Bluepeak",
      title: "Software Engineer",
      description: "Worked across the customer dashboard.",
      highlights: Array.from({ length: 6 }, () => longBullet),
    },
  ],
  projects: [
    {
      name: "ClearProfit",
      description: "Profit analytics for commerce sellers with multi-platform ad sync.",
      tech: ["Next.js", "Node.js", "Stripe"],
      url: "https://clearprofit.app",
    },
    {
      name: "Kliv",
      description: "Subscription billing built on Stripe.",
      tech: ["React", "Stripe"],
      url: "https://kliv.example.com",
    },
  ],
};

describe("generateTailoredResumePDF", () => {
  it("fits a content-heavy resume onto one page", async () => {
    const { base64 } = await generateTailoredResumePDF("user-1", bigTailoredData);
    const pdf = Buffer.from(base64, "base64").toString("latin1");

    expect(pdf.startsWith("%PDF-")).toBe(true);
    expect(pageCount(pdf)).toBe(1);
  });

  it("attaches a clickable link annotation for each project URL", async () => {
    const { base64 } = await generateTailoredResumePDF("user-1", bigTailoredData);
    const pdf = Buffer.from(base64, "base64").toString("latin1");

    expect(pdf).toContain("(https://clearprofit.app)");
    expect(pdf).toContain("(https://kliv.example.com)");
  });

  it("names the file after the candidate", async () => {
    const { fileName } = await generateTailoredResumePDF("user-1", bigTailoredData);
    expect(fileName).toBe("Alex_Rivera_Resume.pdf");
  });
});
