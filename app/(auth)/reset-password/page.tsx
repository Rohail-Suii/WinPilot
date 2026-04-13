import type { Metadata } from "next";
import ResetPasswordPage from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your InPilot account.",
};

export default function Page() {
  return <ResetPasswordPage />;
}
