import { Resend } from "resend";
import {
  verificationEmailHtml,
  passwordResetEmailHtml,
  welcomeEmailHtml,
} from "./templates";

// Lazy-initialize so module evaluation doesn't throw at build time
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const fromAddress = process.env.RESEND_FROM_EMAIL || "Winpilot <noreply@linkedboost.app>";

async function sendEmail(to: string, subject: string, html: string) {
  const { error } = await getResend().emails.send({
    from: fromAddress,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend email error: ${error.message}`);
  }
}

export async function sendVerificationEmail(email: string, name: string, otp: string) {
  await sendEmail(
    email,
    "Verify your email — Winpilot",
    verificationEmailHtml(name, otp)
  );
}

export async function sendPasswordResetEmail(email: string, name: string, resetToken: string) {
  await sendEmail(
    email,
    "Reset your password — Winpilot",
    passwordResetEmailHtml(name, resetToken)
  );
}

export async function sendWelcomeEmail(email: string, name: string) {
  await sendEmail(
    email,
    "Welcome to Winpilot! 🚀",
    welcomeEmailHtml(name)
  );
}
