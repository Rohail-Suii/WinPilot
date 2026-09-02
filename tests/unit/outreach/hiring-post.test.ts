import { describe, it, expect } from "vitest";
import {
  detectHiringPost,
  extractEmails,
  extractApplyLinks,
  extractRoleTitle,
  extractCompany,
  scoreHiringSignals,
  normalizeText,
} from "@/lib/outreach/hiring-post";

/**
 * Detection is the part of this feature that runs on every post the agent
 * reads, and the part where a false positive costs a real email to a real
 * stranger. These cases are written from actual LinkedIn posts: the styling
 * tricks, the obfuscated addresses, and the job-seeker posts that use every
 * hiring word there is.
 */

const NEXUS_POST = `Nexus95 is hiring a 𝐖𝐞𝐛𝐬𝐢𝐭𝐞 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫 on project basis!

📍 Location: Remote
💼 Job Type: Project-Based

𝐑𝐞𝐪𝐮𝐢𝐫𝐞𝐦𝐞𝐧𝐭𝐬
-Strong hands-on experience in WordPress and custom theme development.
-High proficiency in Elementor page builder.

📧 𝐀𝐩𝐩𝐥𝐲 𝐇𝐞𝐫𝐞: Send your updated CV and portfolio to hr@nexus95.com

#Hiring #Nexus95 #WebsiteDeveloper #RemoteJobs`;

describe("normalizeText", () => {
  it("folds the Unicode bold letters LinkedIn writers use as headings", () => {
    expect(normalizeText("𝐀𝐩𝐩𝐥𝐲 𝐇𝐞𝐫𝐞")).toBe("Apply Here");
  });

  it("folds a fancy-lettered address into a real one", () => {
    expect(normalizeText("𝐡𝐫@𝐧𝐞𝐱𝐮𝐬𝟗𝟓.𝐜𝐨𝐦")).toBe("hr@nexus95.com");
  });
});

describe("extractEmails", () => {
  it("finds a plain address in the post body", () => {
    expect(extractEmails("Send your CV to careers@acme.io today")).toEqual(["careers@acme.io"]);
  });

  it("finds one written to dodge scrapers", () => {
    expect(extractEmails("email me at jobs [at] acme [dot] io")).toEqual(["jobs@acme.io"]);
    expect(extractEmails("reach hr (at) acme dot com")).toEqual(["hr@acme.com"]);
  });

  it("reads the mailto href, which survives a truncated label", () => {
    expect(
      extractEmails("Apply here: hr@nexus…", [{ href: "mailto:hr@nexus95.com", text: "hr@nexus…" }])
    ).toEqual(["hr@nexus95.com"]);
  });

  it("puts the hiring inbox ahead of a personal address", () => {
    const emails = extractEmails("Questions to sam.patel@acme.io, applications to careers@acme.io");
    expect(emails[0]).toBe("careers@acme.io");
  });

  it("drops noreply, LinkedIn's own hosts and placeholder domains", () => {
    expect(
      extractEmails("noreply@acme.io someone@example.com asset@media.licdn.com")
    ).toEqual([]);
  });

  it("never returns the user's own address", () => {
    expect(
      extractEmails("write to me@myself.com or hr@acme.io", [], ["me@myself.com"])
    ).toEqual(["hr@acme.io"]);
  });
});

describe("extractApplyLinks", () => {
  it("keeps a Google Form", () => {
    expect(extractApplyLinks("Apply here: https://forms.gle/abc123")).toEqual([
      "https://forms.gle/abc123",
    ]);
  });

  it("keeps an ATS and a careers page", () => {
    const links = extractApplyLinks(
      "https://jobs.lever.co/acme/123 and https://acme.io/careers/backend"
    );
    expect(links).toHaveLength(2);
  });

  it("ignores LinkedIn's own hashtag and profile links", () => {
    expect(
      extractApplyLinks("see the post", [
        { href: "https://www.linkedin.com/search/results/all/?keywords=%23hiring" },
        { href: "https://www.linkedin.com/in/someone" },
      ])
    ).toEqual([]);
  });

  it("keeps a LinkedIn job permalink, which is a real place to apply", () => {
    expect(
      extractApplyLinks("", [{ href: "https://www.linkedin.com/jobs/view/12345/" }])
    ).toHaveLength(1);
  });
});

describe("scoreHiringSignals", () => {
  it("refuses a job seeker's own post however many hiring words it has", () => {
    const result = scoreHiringSignals(
      "I'm currently looking for a Full Stack Developer role. #OpenToWork — full-time, remote, salary negotiable, please refer me."
    );
    expect(result.score).toBe(0);
    expect(result.signals[0]).toMatch(/job seeker/);
  });

  it("clears the threshold on one unambiguous phrase", () => {
    expect(scoreHiringSignals("We are hiring a Backend Engineer.").score).toBeGreaterThanOrEqual(
      0.5
    );
  });

  it("does not fire on an ordinary post that mentions a role", () => {
    expect(
      scoreHiringSignals("Three years into this role and I still learn something weekly.").score
    ).toBeLessThan(0.5);
  });
});

describe("extractRoleTitle / extractCompany", () => {
  it("reads the role out of the styled headline", () => {
    expect(extractRoleTitle(NEXUS_POST)).toBe("Website Developer");
  });

  it("reads a role given as a labelled field", () => {
    expect(extractRoleTitle("Position: Senior Data Engineer\nLocation: Remote")).toBe(
      "Senior Data Engineer"
    );
  });

  it("prefers the company the post names over the account that posted it", () => {
    expect(extractCompany(NEXUS_POST, "Talent Team")).toBe("Nexus95");
  });

  it("falls back to the address domain, but not to a free mail provider", () => {
    expect(extractCompany("send your cv", "", ["careers@acme.io"])).toBe("Acme");
    expect(extractCompany("send your cv", "Jane Doe", ["jane@gmail.com"])).toBe("Jane Doe");
  });
});

describe("detectHiringPost", () => {
  it("reads a real hiring post end to end", () => {
    const result = detectHiringPost({
      content: NEXUS_POST,
      links: [{ href: "mailto:hr@nexus95.com" }],
      authorName: "Nexus95",
    });

    expect(result.isHiring).toBe(true);
    expect(result.emails).toEqual(["hr@nexus95.com"]);
    expect(result.roleTitle).toBe("Website Developer");
    expect(result.company).toBe("Nexus95");
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("records a form-only post as hiring with no address", () => {
    const result = detectHiringPost({
      content: "We're hiring a Backend Engineer. Apply here: https://forms.gle/abc",
    });
    expect(result.isHiring).toBe(true);
    expect(result.emails).toEqual([]);
    expect(result.applyLinks).toEqual(["https://forms.gle/abc"]);
  });

  it("trusts the model's classification when the wording is subtle", () => {
    const result = detectHiringPost({
      content: "Our team has room for one more person on the platform side. Mail rob@acme.io.",
      aiPostType: "hiring",
    });
    expect(result.isHiring).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("leaves an ordinary technical post alone even with an address in it", () => {
    const result = detectHiringPost({
      content:
        "Wrote up how we cut our p99 latency in half last quarter. Questions welcome at rob@acme.io.",
    });
    expect(result.isHiring).toBe(false);
  });

  it("does not treat a job seeker's post as an opening", () => {
    const result = detectHiringPost({
      content: "I'm looking for a new role as a React developer. #OpenToWork. CV at me@mail.com",
      aiPostType: "hiring",
    });
    expect(result.isHiring).toBe(false);
  });
});
