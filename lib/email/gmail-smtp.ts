/**
 * Sending job applications from the user's own Gmail account.
 *
 * The single most important deliverability decision in this feature is made
 * here: the mail leaves through authenticated SMTP on the user's real Gmail
 * account, so it is signed by Google's DKIM key, passes SPF and DMARC, and
 * carries Google's sending reputation instead of a cold domain's. A recruiter
 * receiving it sees exactly what they would see if the user had typed it in
 * the Gmail web client — because, as far as the mail system is concerned, they
 * did.
 *
 * Everything else here is in service of not undoing that: plain-text-first
 * multipart bodies, no tracking pixels, no marketing HTML, no bulk headers, one
 * attachment, and a real Reply-To.
 *
 * Requires a Google App Password (2-Step Verification on, then an app password
 * generated for "Mail"). A normal account password will not authenticate.
 */

import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export interface GmailCredentials {
  /** The full Gmail address. Must match the From, or Google rewrites it. */
  user: string;
  /** 16-character app password. Google displays it in groups of four. */
  appPassword: string;
}

export interface OutreachAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Google shows app passwords as "abcd efgh ijkl mnop"; the spaces are display only. */
export function normalizeAppPassword(raw: string): string {
  return (raw || "").replace(/\s+/g, "");
}

function buildTransport(credentials: GmailCredentials): Transporter<SMTPTransport.SentMessageInfo> {
  const options: SMTPTransport.Options = {
    host: "smtp.gmail.com",
    // Implicit TLS. 587 with STARTTLS works too, but 465 fails closed: there is
    // no plaintext phase in which a downgrade could leave the password exposed.
    port: 465,
    secure: true,
    auth: {
      user: credentials.user,
      pass: normalizeAppPassword(credentials.appPassword),
    },
    // Unpooled, which is nodemailer's default and what is wanted here: this is
    // a person applying for jobs, not a campaign, and a burst of parallel
    // connections is the first thing Gmail throttles.
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 40_000,
  };

  return nodemailer.createTransport(options);
}

/**
 * Turn Gmail's SMTP errors into something a user can act on.
 *
 * The raw responses are the single biggest support burden in a feature like
 * this — "535-5.7.8 Username and Password not accepted" tells a user nothing
 * about App Passwords.
 */
export function explainSmtpError(error: unknown): string {
  const err = error as { code?: string; responseCode?: number; message?: string };
  const message = err?.message || String(error);

  if (err?.code === "EAUTH" || /535|Username and Password not accepted|BadCredentials/i.test(message)) {
    return "Gmail rejected the login. Use a Google App Password (Account → Security → 2-Step Verification → App passwords), not your normal password.";
  }
  if (/Daily user sending (?:limit|quota) exceeded|5\.4\.5/i.test(message)) {
    return "Gmail's daily sending limit for this account is used up. Sending resumes tomorrow.";
  }
  if (/Try again later|4\.7\.0|Too many login attempts/i.test(message)) {
    return "Gmail is rate-limiting this account right now. This will be retried shortly.";
  }
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") {
    return "Could not reach smtp.gmail.com. Check the network or firewall, then retry.";
  }
  if (/550|does not exist|Address not found|RecipientNotFound/i.test(message)) {
    return "The recipient address was rejected as non-existent.";
  }
  return message.slice(0, 300);
}

/** Whether a failure is worth retrying, or is permanent until something changes. */
export function isRetryableSmtpError(error: unknown): boolean {
  const err = error as { code?: string; responseCode?: number; message?: string };
  const message = err?.message || String(error);

  // Bad credentials and a non-existent recipient will fail identically forever.
  if (err?.code === "EAUTH") return false;
  if (/550|5\.1\.1|does not exist|Address not found/i.test(message)) return false;
  // Everything else — timeouts, throttling, transient 4xx — is worth another go.
  return true;
}

/** Confirm the credentials work, without sending anything. */
export async function verifyGmailCredentials(
  credentials: GmailCredentials
): Promise<{ ok: true } | { ok: false; error: string }> {
  const transport = buildTransport(credentials);
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: explainSmtpError(error) };
  } finally {
    transport.close();
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

/**
 * The plain-text body as the simplest possible HTML.
 *
 * A multipart/alternative mail with a text part and a *matching* HTML part
 * scores better than either alone; a mismatch between the two is itself a spam
 * signal, so this is a faithful rendering and nothing more. No tables, no
 * images, no styling beyond a readable font — the markup of a personal email.
 *
 * Bare URLs become links whose visible text is the URL itself. A link whose
 * label disagrees with its destination is the oldest phishing tell there is.
 */
export function plainTextToHtml(text: string): string {
  const escaped = (text || "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
  const linked = escaped.replace(
    /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"']/g,
    (url) => `<a href="${url}">${url}</a>`
  );
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px">${block.replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2328">${paragraphs}</div>`;
}

/**
 * Send one application.
 *
 * Everything passed in is already final — the subject and body were written and
 * checked upstream. This function's only judgement is envelope-level.
 */
export async function sendApplicationEmail(input: {
  credentials: GmailCredentials;
  fromName?: string;
  to: string;
  subject: string;
  /** Plain text. The HTML part is derived from it so the two always agree. */
  body: string;
  attachments?: OutreachAttachment[];
  /** Blind-copy the sender so the thread lands in their own mailbox too. */
  bccSelf?: boolean;
}): Promise<SendResult> {
  const transport = buildTransport(input.credentials);

  try {
    const from = input.fromName
      ? `${input.fromName.replace(/["<>]/g, "")} <${input.credentials.user}>`
      : input.credentials.user;

    const info = await transport.sendMail({
      from,
      to: input.to,
      // A recruiter hitting reply must reach a mailbox the user reads. It is
      // the same address here, but stating it explicitly stops a future From
      // change from silently orphaning replies.
      replyTo: input.credentials.user,
      ...(input.bccSelf ? { bcc: input.credentials.user } : {}),
      subject: input.subject,
      text: input.body,
      html: plainTextToHtml(input.body),
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType || "application/pdf",
      })),
      // No X-Mailer, no Precedence: bulk, no List-Unsubscribe. Those headers
      // belong on campaigns, and a filter that sees them on a one-to-one mail
      // treats it as one.
    });

    return {
      messageId: info.messageId || "",
      accepted: (info.accepted || []).map(String),
      rejected: (info.rejected || []).map(String),
    };
  } finally {
    transport.close();
  }
}
