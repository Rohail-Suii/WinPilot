import type { Metadata } from "next";
import ForgotPasswordPage from "./forgot-password-client";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your InPilot password.",
  alternates: { canonical: "/forgot-password" },
};

export default function Page() {
  return <ForgotPasswordPage />;
}
