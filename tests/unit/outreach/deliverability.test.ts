import { describe, it, expect } from "vitest";
import {
  assessSpamRisk,
  isValidEmail,
  SPAM_REWRITE_THRESHOLD,
} from "@/lib/email/deliverability";
import { plainTextToHtml, normalizeAppPassword, explainSmtpError, isRetryableSmtpError } from "@/lib/email/gmail-smtp";
import { finalizeBody } from "@/lib/ai/prompts/job-application-email";

/**
 * The content half of "do not land in spam". The transport half — Gmail SMTP,
 * so DKIM and SPF pass — cannot be unit tested; what can be tested is that a
 * draft which would trip a filter is caught before it is sent.
 */

const GOOD_EMAIL = `Hi Sarah,

I saw your post about the Website Developer role at Nexus95. I have built and shipped thirteen production sites, including a Shopify profit-analytics dashboard that reconciles ad spend from fifteen platforms, so converting a Figma file into a fast, responsive WordPress theme is familiar ground.

On the requirements you listed: I work daily in HTML, CSS, JavaScript and PHP, and I have taken two client sites from a four-second load to under one second through image and query work.

My resume is attached and my portfolio is at https://rohail.systems. I can start immediately and am happy to work on a project basis.

Rohail Ahmed`;

describe("assessSpamRisk", () => {
  it("passes a real, specific application", () => {
    const result = assessSpamRisk({
      subject: "Website Developer — Rohail Ahmed",
      body: GOOD_EMAIL,
      attachments: 1,
    });
    expect(result.score).toBeLessThan(SPAM_REWRITE_THRESHOLD);
  });

  it("catches marketing urgency and shouting", () => {
    const result = assessSpamRisk({
      subject: "URGENT!! ACT NOW",
      body: "CLICK HERE for a 100% FREE consultation!! Limited time only!!!",
    });
    expect(result.score).toBeGreaterThanOrEqual(SPAM_REWRITE_THRESHOLD);
    expect(result.issues.join(" ")).toMatch(/urgency|capitals|bulk mail/i);
  });

  it("flags a fake Re: prefix", () => {
    const result = assessSpamRisk({ subject: "Re: your job post", body: GOOD_EMAIL });
    expect(result.issues.join(" ")).toMatch(/fake Re/i);
  });

  it("flags a body too short to read as a real application", () => {
    const result = assessSpamRisk({ subject: "Developer — Rohail Ahmed", body: "Hi, CV attached." });
    expect(result.issues.join(" ")).toMatch(/too short/i);
  });

  it("flags link stuffing and shorteners", () => {
    const result = assessSpamRisk({
      subject: "Backend Engineer — Rohail Ahmed",
      body: `${GOOD_EMAIL}\nhttps://a.com https://b.com https://bit.ly/xyz https://d.com`,
    });
    expect(result.issues.join(" ")).toMatch(/links/i);
    expect(result.issues.join(" ")).toMatch(/shortened/i);
  });

  it("does not punish the acronyms a technical resume needs", () => {
    const result = assessSpamRisk({
      subject: "Backend Engineer — Rohail Ahmed",
      body: GOOD_EMAIL.replace("HTML, CSS, JavaScript and PHP", "AWS, SQL, REST and CI/CD"),
    });
    expect(result.score).toBeLessThan(SPAM_REWRITE_THRESHOLD);
  });

  it("flags an unsubscribe line, which makes a 1:1 mail look like a campaign", () => {
    const result = assessSpamRisk({
      subject: "Website Developer — Rohail Ahmed",
      body: `${GOOD_EMAIL}\n\nTo unsubscribe, reply STOP.`,
    });
    expect(result.issues.join(" ")).toMatch(/unsubscribe/i);
  });
});

describe("isValidEmail", () => {
  it("accepts real addresses and rejects malformed ones", () => {
    expect(isValidEmail("hr@nexus95.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.domain.co.uk")).toBe(true);
    expect(isValidEmail("hr@nexus95")).toBe(false);
    expect(isValidEmail("hr @nexus95.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("plainTextToHtml", () => {
  it("escapes markup rather than rendering it", () => {
    expect(plainTextToHtml("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("links a bare URL to itself, so the label never disagrees with the target", () => {
    const html = plainTextToHtml("Portfolio: https://rohail.systems");
    expect(html).toContain('<a href="https://rohail.systems">https://rohail.systems</a>');
  });

  it("keeps paragraphs and line breaks", () => {
    const html = plainTextToHtml("Hi Sarah,\n\nFirst line\nSecond line");
    expect(html).toContain("<p");
    expect(html).toContain("<br>");
  });
});

describe("finalizeBody", () => {
  it("strips a repeated subject line and markdown emphasis", () => {
    const body = finalizeBody("Subject: Developer role\n\nHi there,\n\n**Strong** experience.");
    expect(body).not.toMatch(/^Subject:/);
    expect(body).toContain("Strong experience.");
  });

  it("appends the signature once", () => {
    const signature = "Rohail Ahmed\n+92 333 4922629";
    const once = finalizeBody("Body text", signature);
    expect(once.endsWith(signature)).toBe(true);
    expect(finalizeBody(once, signature)).toBe(once);
  });
});

describe("SMTP error handling", () => {
  it("explains a rejected app password in terms a user can act on", () => {
    const message = explainSmtpError({ code: "EAUTH", message: "535-5.7.8 Username and Password not accepted" });
    expect(message).toMatch(/App Password/i);
  });

  it("does not retry a permanent failure", () => {
    expect(isRetryableSmtpError({ code: "EAUTH", message: "535" })).toBe(false);
    expect(isRetryableSmtpError({ message: "550 5.1.1 The email account does not exist" })).toBe(false);
  });

  it("retries a timeout", () => {
    expect(isRetryableSmtpError({ code: "ETIMEDOUT", message: "timed out" })).toBe(true);
  });

  it("strips the display spaces Google puts in an app password", () => {
    expect(normalizeAppPassword("tnih pulf ixky ocde")).toBe("tnihpulfixkyocde");
  });
});
