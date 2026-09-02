import { OutreachClient } from "@/components/outreach/outreach-client";

export const metadata = {
  title: "Job Applications | Winpilot",
  description:
    "Hiring posts found on your feed, the applications emailed from your Gmail, and the ones saved for you to apply to by hand.",
};

export default function OutreachPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <OutreachClient />
    </div>
  );
}
