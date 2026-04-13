import type { Metadata } from "next";
import VerifyEmailPage from "./verify-email-client";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your email address for InPilot.",
};

export default function Page() {
  return <VerifyEmailPage />;
}
