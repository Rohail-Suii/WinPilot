import type { Metadata } from "next";
import RegisterPage from "./register-client";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your free InPilot account.",
  alternates: { canonical: "/register" },
};

export default function Page() {
  return <RegisterPage />;
}
