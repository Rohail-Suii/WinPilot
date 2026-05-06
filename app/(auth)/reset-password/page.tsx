import type { Metadata } from "next";
import ResetPasswordPage from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Winpilot account.",
};

export default function Page() {
  return <ResetPasswordPage />;
}
