import { describe, it, expect, vi } from "vitest";
import { categorizeSkills, formatDateRange, formatDegree } from "@/lib/services/resume-pdf";

// resume-pdf statically imports the DB-backed resume service; stub it so these
// pure-formatting tests never touch Mongo.
vi.mock("@/lib/services/resume-service", () => ({
  getDefaultResume: async () => null,
  resumeToText: () => "",
}));

describe("categorizeSkills", () => {
  it("does not let short keywords swallow unrelated skills", () => {
    // Regression: substring matching put "Product Management" under "Languages"
    // because it contains the letter "r" (a keyword for the R language).
    const grouped = categorizeSkills(["Product Management", "Stakeholder Engagement"]);
    expect(grouped.find((g) => g.label === "Languages")).toBeUndefined();
  });

  it("still matches real languages and frameworks", () => {
    const grouped = categorizeSkills([
      "TypeScript",
      "Python",
      "React",
      "PostgreSQL",
      "Docker",
      "R",
    ]);
    const languages = grouped.find((g) => g.label === "Languages");
    expect(languages?.items).toEqual(expect.arrayContaining(["TypeScript", "Python", "R"]));
    expect(grouped.find((g) => g.label === "Frameworks & Libraries")?.items).toContain("React");
    expect(grouped.find((g) => g.label === "Databases")?.items).toContain("PostgreSQL");
  });

  it("matches keywords across a slash-joined skill", () => {
    const grouped = categorizeSkills([
      "Agile/Scrum Methodologies",
      "TypeScript",
      "React",
      "AWS",
    ]);
    expect(grouped.find((g) => g.label === "Product & Delivery")?.items).toContain(
      "Agile/Scrum Methodologies"
    );
  });

  it("labels the leftover bucket as core competencies when it dominates", () => {
    const grouped = categorizeSkills([
      "Technical Leadership",
      "Incident Resolution",
      "Cross-Functional Collaboration",
      "Executive Communication",
      "TypeScript",
    ]);
    expect(grouped[0].label).toBe("Core Competencies");
    expect(grouped[0].items).toContain("Technical Leadership");
  });

  it("keeps every skill it was given", () => {
    const skills = ["TypeScript", "Kubernetes", "Storytelling", "Vendor Management"];
    const grouped = categorizeSkills(skills);
    expect(grouped.flatMap((g) => g.items).sort()).toEqual([...skills].sort());
  });
});

describe("formatDegree", () => {
  it("does not repeat the field when the degree already names it", () => {
    expect(formatDegree("B.Sc. Computer Science", "Computer Science")).toBe(
      "B.Sc. Computer Science"
    );
  });

  it("joins degree and field when they differ", () => {
    expect(formatDegree("B.Sc.", "Computer Science")).toBe("B.Sc. in Computer Science");
  });

  it("handles a missing half", () => {
    expect(formatDegree("", "Computer Science")).toBe("Computer Science");
    expect(formatDegree("MBA", "")).toBe("MBA");
  });
});

describe("formatDateRange", () => {
  it("renders current roles as Present", () => {
    expect(formatDateRange({ startDate: "01/2026", endDate: "", current: true })).toBe(
      "01/2026 – Present"
    );
  });

  it("collapses identical start and end dates", () => {
    expect(formatDateRange({ startDate: "2025", endDate: "2025" })).toBe("2025");
  });

  it("returns empty when there are no dates", () => {
    expect(formatDateRange({ startDate: "", endDate: "" })).toBe("");
    expect(formatDateRange(null)).toBe("");
  });
});
