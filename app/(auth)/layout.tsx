import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: {
    default: "LinkedBoost",
    template: "%s — LinkedBoost",
  },
  description: "Sign in or create your LinkedBoost account to automate LinkedIn.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-var(--bg-primary) flex flex-col">
      {/* Subtle background effect */}
      <div className="aurora-bg opacity-50" />
      <div className="absolute inset-0 dot-grid opacity-20" />

      {/* Header with back link */}
      <div className="relative z-20 flex items-center justify-between p-4 md:p-6 max-w-7xl mx-auto w-full">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg text-var(--text-primary) hover:text-var(--accent-cyan) transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta) flex items-center justify-center text-var(--text-inverse) font-bold">
            LB
          </div>
          <span className="hidden sm:inline">LinkedBoost</span>
        </Link>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
