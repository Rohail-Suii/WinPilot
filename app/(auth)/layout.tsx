import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "InPilot",
    template: "%s — InPilot",
  },
  description: "Sign in or create your InPilot account to automate LinkedIn.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-[#00E5FF]/8 via-transparent to-transparent" />
      <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      {children}
    </div>
  );
}
