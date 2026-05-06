import type { Metadata } from "next";
import VerifyEmailPage from "./verify-email-client";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your email address for Winpilot.",
};

export default function Page() {
  return <VerifyEmailPage />;
}
