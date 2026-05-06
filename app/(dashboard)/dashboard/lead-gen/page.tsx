import { LeadGenClient } from "@/components/lead-gen/lead-gen-client";

export const metadata = {
  title: "Lead Generation | Winpilot",
  description: "Auto-find and comment on LinkedIn posts to generate cold leads for your services.",
};

export default function LeadGenPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <LeadGenClient />
    </div>
  );
}
