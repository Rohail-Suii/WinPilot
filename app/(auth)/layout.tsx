import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Winpilot",
    template: "%s — Winpilot",
  },
  description: "Sign in or create your Winpilot account to automate LinkedIn.",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen bg-[#080810]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[#00E5FF]/6 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-[#6366F1]/5 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: "radial-gradient(rgba(0,229,255,0.07) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Left branding panel — desktop only */}
      <div className="relative hidden lg:flex lg:w-[460px] xl:w-[520px] flex-col justify-between border-r border-white/5 bg-[#050508] px-12 py-12 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#6366F1] shadow-lg shadow-[#00E5FF]/25">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Winpilot
          </span>
        </div>

        {/* Headline */}
        <div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            Your LinkedIn,<br />
            <span className="bg-gradient-to-r from-[#00E5FF] to-[#6366F1] bg-clip-text text-transparent">
              on autopilot.
            </span>
          </h2>
          <p className="text-sm text-white/40 leading-relaxed mb-10">
            Apply to 50+ jobs daily, grow your brand with AI content, and scrape leads — all without lifting a finger.
          </p>
          <ul className="space-y-3">
            {[
              "AI-tailored applications sent automatically",
              "Post scheduling with human-level writing",
              "Lead generation & smart outreach",
              "Zero manual clicking. Ever.",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/50">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00E5FF]/10 text-[#00E5FF]">
                  <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Testimonial */}
        <div className="rounded-2xl border border-white/8 bg-white/3 p-6">
          <p className="text-sm text-white/55 leading-relaxed mb-4">
            &ldquo;Finally stopped manually applying. Winpilot handles 100 apps while I sleep.&rdquo;
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00E5FF]/20 to-[#6366F1]/20 text-xs font-bold text-[#00E5FF]">
              JM
            </div>
            <div>
              <p className="text-xs font-semibold text-white/70">@jsdevmike</p>
              <p className="text-xs text-white/30">Senior Eng at Stripe</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

