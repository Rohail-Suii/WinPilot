import type { Metadata } from "next";
import LoginPage from "./login-client";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your InPilot account.",
  alternates: { canonical: "/login" },
};

export default function Page() {
  return <LoginPage />;
}
