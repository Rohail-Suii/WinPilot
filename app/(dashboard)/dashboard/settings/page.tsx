import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsClient } from "@/components/settings/settings-client";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your profile, API keys, resume, automation preferences, and extension settings.",
};

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsClient />
    </Suspense>
  );
}
