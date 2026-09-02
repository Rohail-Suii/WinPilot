import { describe, it, expect } from "vitest";
import { assessRelevance, fieldsOf, matchSkills } from "@/lib/outreach/relevance";

/**
 * The gate that decides "is this job anything to do with me".
 *
 * The profile below is a real one: a full-stack JavaScript engineer. The cases
 * are the two failure modes that matter — applying for a job in someone else's
 * profession, and refusing a job in your own because the tool list is not an
 * exact match.
 */

const PROFILE = {
  skills: [
    "React", "Next.js", "React Native", "Redux", "Tailwind CSS", "Three.js",
    "Node.js", "TypeScript", "NestJS", "Express", "REST & Webhooks",
    "MongoDB", "PostgreSQL", "Stripe", "Docker", "AWS",
  ],
  titles: [
    "Full-Stack Engineer",
    "Full-Stack Developer",
    "Frontend Engineer (Contract)",
  ],
};

describe("fieldsOf", () => {
  it("names the occupation from a role title", () => {
    expect(fieldsOf("Website Developer")).toContain("software");
    expect(fieldsOf("Registered Nurse")).toContain("healthcare");
    expect(fieldsOf("Sales Executive")).toContain("sales");
    expect(fieldsOf("Mechanical Engineer")).toContain("physical_engineering");
    expect(fieldsOf("Data Scientist")).toContain("data");
  });

  it("does not let a physical engineering role fall through to software", () => {
    expect(fieldsOf("Civil Engineer")[0]).toBe("physical_engineering");
    expect(fieldsOf("Sales Engineer")[0]).toBe("sales");
  });

  it("returns nothing for a post that names no occupation", () => {
    expect(fieldsOf("We are hiring. Get in touch.")).toEqual([]);
  });
});

describe("matchSkills", () => {
  it("matches tech names with dots in them", () => {
    expect(matchSkills("Must know Next.js and Node.js", PROFILE.skills)).toEqual(
      expect.arrayContaining(["Next.js", "Node.js"])
    );
  });

  it("does not match a skill inside a longer word", () => {
    // "React" must not fire on "reactive", nor "Java" on "JavaScript".
    expect(matchSkills("We use a reactive event bus", ["React"])).toEqual([]);
    expect(matchSkills("Strong JavaScript fundamentals", ["Java"])).toEqual([]);
  });

  it("splits a compound profile entry so a post can match either half", () => {
    expect(matchSkills("experience with webhooks", ["REST & Webhooks"])).toEqual(["Webhooks"]);
  });
});

describe("assessRelevance", () => {
  it("applies for a WordPress role, which names none of the profile's tools", () => {
    const verdict = assessRelevance(
      {
        roleTitle: "Website Developer",
        postContent:
          "Strong hands-on experience in WordPress and custom theme development. High proficiency in Elementor. Strong foundation in HTML5, CSS3, JavaScript and PHP.",
      },
      PROFILE
    );

    expect(verdict.related).toBe(true);
    expect(verdict.matchedSkills).toEqual([]);
    expect(verdict.reason).toMatch(/in your field/i);
  });

  it("refuses a job in a different profession", () => {
    for (const [roleTitle, body] of [
      ["Registered Nurse", "Valid nursing licence and two years of ICU experience."],
      ["Sales Executive", "Cold calling, lead generation and closing deals."],
      ["Accountant", "Bookkeeping, ledgers and tax filing."],
      ["Delivery Rider", "Own bike and valid licence required."],
      ["Mechanical Engineer", "AutoCAD, thermodynamics and site inspections."],
    ] as const) {
      const verdict = assessRelevance({ roleTitle, postContent: body }, PROFILE);
      expect(verdict.related, roleTitle).toBe(false);
      expect(verdict.certain, roleTitle).toBe(true);
    }
  });

  it("applies for neighbouring work only when it names something they have used", () => {
    // Data engineering sits next to software, so a post that asks for Node and
    // Postgres is worth applying to.
    expect(
      assessRelevance(
        {
          roleTitle: "Data Engineer",
          postContent: "Build ingestion pipelines. Node.js, PostgreSQL and Airflow.",
        },
        PROFILE
      ).related
    ).toBe(true);

    // The same neighbouring field, sharing nothing but the neighbourhood.
    const distant = assessRelevance(
      { roleTitle: "Data Scientist", postContent: "Python, pandas, scikit-learn, statistics." },
      PROFILE
    );
    expect(distant.related).toBe(false);
    expect(distant.certain).toBe(true);
  });

  it("does not treat a graphic design role as a front-end career", () => {
    const verdict = assessRelevance(
      {
        roleTitle: "Graphic Designer",
        postContent: "Adobe Illustrator, Photoshop and brand identity work.",
      },
      PROFILE
    );
    expect(verdict.related).toBe(false);
  });

  it("matches an occupation written in the plural", () => {
    for (const title of ["Sales Executives", "Delivery Riders", "Accountants"]) {
      expect(assessRelevance({ roleTitle: title, postContent: title }, PROFILE).related, title).toBe(
        false
      );
    }
  });

  it("is not fooled by a software post that mentions the sales team", () => {
    const verdict = assessRelevance(
      {
        roleTitle: "Backend Developer",
        postContent:
          "You will build the internal tools our sales executives use every day. Node.js and PostgreSQL.",
      },
      PROFILE
    );
    expect(verdict.related).toBe(true);
    expect(verdict.postField).toBe("software");
  });

  it("says so, rather than guessing, when the post names no occupation at all", () => {
    const verdict = assessRelevance(
      { roleTitle: "", postContent: "We are hiring. Write to hr@acme.io if that sounds like you." },
      PROFILE
    );
    expect(verdict.related).toBe(false);
    expect(verdict.certain).toBe(false);
  });

  it("accepts an unnamed role that asks for two things the person has used", () => {
    const verdict = assessRelevance(
      { roleTitle: "", postContent: "We need someone strong in React and MongoDB for a 3-month build." },
      PROFILE
    );
    expect(verdict.related).toBe(true);
    expect(verdict.matchedSkills).toEqual(expect.arrayContaining(["React", "MongoDB"]));
  });

  it("under strict matching, holds back an in-field post that names none of the tools", () => {
    const verdict = assessRelevance(
      { roleTitle: "Website Developer", postContent: "WordPress, Elementor and PHP." },
      PROFILE,
      { strictSkillMatch: true }
    );
    expect(verdict.related).toBe(false);
    expect(verdict.reason).toMatch(/strict matching/i);
  });

  it("under strict matching, still applies when the post names a real overlap", () => {
    const verdict = assessRelevance(
      { roleTitle: "Frontend Engineer", postContent: "React, Next.js and TypeScript." },
      PROFILE,
      { strictSkillMatch: true }
    );
    expect(verdict.related).toBe(true);
  });
});
