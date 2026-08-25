import { AutopilotClient } from "@/components/autopilot/autopilot-client";

export const metadata = {
  title: "Autopilot | Winpilot",
  description:
    "An autonomous LinkedIn operator that sets its own weekly goals, works your pipeline, and rewrites its strategy from what actually worked.",
};

export default function AutopilotPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AutopilotClient />
    </div>
  );
}
