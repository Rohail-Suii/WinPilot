"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════════════ */

const NAV_LINKS = [
  { label: "Features", href: "#capabilities" },
  { label: "Docs", href: "#quickstart" },
  { label: "Pricing", href: "#pricing" },
  { label: "Changelog", href: "#footer" },
];

const TRUSTED_COMPANIES = [
  "GitHub",
  "Stripe",
  "Vercel",
  "Linear",
  "Raycast",
  "Supabase",
];

const TESTIMONIALS = [
  {
    quote:
      "Finally stopped manually applying. InPilot handles 100 apps while I sleep.",
    name: "@jsdevmike",
    role: "Senior Eng at Stripe",
    initials: "JM",
  },
  {
    quote:
      "The scraper API is insane. I piped LinkedIn data straight into my CRM in an afternoon.",
    name: "@buildwithpriya",
    role: "Indie hacker",
    initials: "BP",
  },
  {
    quote:
      "Scheduled 3 months of LinkedIn content in one afternoon. Game changer.",
    name: "@aaronxyz_",
    role: "DevRel at Vercel",
    initials: "AX",
  },
  {
    quote:
      "Went from 0 to 200 applications in a weekend. The CLI feels like magic.",
    name: "@k_liao_dev",
    role: "Founding Eng at Linear",
    initials: "KL",
  },
  {
    quote:
      "We built our entire outbound pipeline on InPilot\u2019s API. Saved us hiring a VA.",
    name: "@marcusbuilds",
    role: "CTO at Launchpad",
    initials: "MB",
  },
  {
    quote:
      "The webhook integration is *chef\u2019s kiss*. Real-time scrape data flowing into Slack.",
    name: "@devshreya",
    role: "Growth Eng at Raycast",
    initials: "DS",
  },
];

const PRICING_PLANS = [
  {
    name: "Hobby",
    price: "$0",
    period: "/ month",
    features: [
      "50 job apps / mo",
      "500 scrapes / mo",
      "5 scheduled posts",
      "Community support",
    ],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/ mo",
    badge: "RECOMMENDED",
    features: [
      "2,000 apps / mo",
      "50,000 scrapes",
      "Unlimited posts",
      "API access",
      "Priority email support",
    ],
    cta: "Get Pro \u2192",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$99",
    period: "/ mo",
    features: [
      "Unlimited everything",
      "Team seats",
      "Priority support",
      "SLA guarantee",
      "Dedicated account manager",
    ],
    cta: "Contact us",
    highlighted: false,
  },
];

const STEPS = [
  {
    num: "01",
    title: "Install",
    body: "One command. Global install. You\u2019re ready.",
    code: "npm install -g inpilot",
  },
  {
    num: "02",
    title: "Authenticate",
    body: "Connect your LinkedIn account securely via token.",
    code: "inpilot auth --token YOUR_LINKEDIN_TOKEN",
  },
  {
    num: "03",
    title: "Automate",
    body: "Start applying, scraping, or scheduling immediately.",
    code: "inpilot apply --jobs 50 --auto",
  },
];

/* ═══════════════════════════════════════════════════════════
   SVG ICONS (inline, stroke-style, 20px)
   ═══════════════════════════════════════════════════════════ */

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════ */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════ */

function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScroll = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const curr = window.scrollY;
      setHidden(curr > 100 && curr > lastScroll.current);
      lastScroll.current = curr;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-transform duration-300"
        style={{
          transform: hidden ? "translateY(-100%)" : "translateY(0)",
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #1A1A1A",
          height: 56,
        }}
      >
        <div className="max-w-[1200px] mx-auto px-5 md:px-10 h-full flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-[#00E5FF] text-xs">&#9632;</span>
            <span className="text-white font-bold text-lg tracking-tight">
              InPilot
            </span>
          </Link>

          {/* Center links — desktop */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm text-[#888] hover:text-white transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right side — desktop */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="text-sm text-[#888] hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm font-semibold bg-white text-black rounded-md px-4 py-2 hover:bg-[#00E5FF] transition-colors cta-hover"
            >
              Get started free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="md:hidden text-[#888] hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8"
          style={{ background: "rgba(10,10,10,0.97)" }}
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-2xl text-[#888] hover:text-white transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <Link
            href="/auth/signin"
            className="text-lg text-[#888] hover:text-white"
            onClick={() => setMobileOpen(false)}
          >
            Sign in
          </Link>
          <Link
            href="/auth/signup"
            className="text-lg font-semibold bg-white text-black rounded-md px-6 py-3 hover:bg-[#00E5FF] transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            Get started free
          </Link>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   TERMINAL VISUAL
   ═══════════════════════════════════════════════════════════ */

const TERMINAL_LINES = [
  { type: "cmd" as const, text: "$ inpilot apply --jobs 50 --filter \"remote AND senior\"" },
  { type: "blank" as const, text: "" },
  { type: "ok" as const, text: "\u2713 Scraping LinkedIn jobs...     [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588] 412 found" },
  { type: "ok" as const, text: "\u2713 Filtering by criteria...      [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588] 50 matched" },
  { type: "ok" as const, text: "\u2713 Generating cover letters...   [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588] 50 done" },
  { type: "progress" as const, text: "\u2192 Submitting applications...    [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591] 38/50" },
  { type: "blank" as const, text: "" },
  { type: "result" as const, text: "Applied to 38 jobs in 4m 12s." },
  { type: "blank" as const, text: "" },
  { type: "cmd" as const, text: "$ inpilot post --schedule \"Mon,Wed,Fri 9am\" --content ./posts/" },
  { type: "ok" as const, text: "\u2713 Scheduled 12 posts across 3 weeks." },
  { type: "blank" as const, text: "" },
  { type: "cursor" as const, text: "$ " },
];

function TerminalBlock() {
  const [visibleLines, setVisibleLines] = useState(0);
  const termRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= TERMINAL_LINES.length) clearInterval(interval);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={termRef}
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid #222",
        boxShadow: "0 0 60px rgba(0,229,255,0.06)",
      }}
    >
      {/* Chrome bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ background: "#1A1A1A" }}
      >
        <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
        <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
        <span className="w-3 h-3 rounded-full bg-[#28C840]" />
        <span className="ml-4 text-xs text-[#555] font-mono">
          inpilot {"\u2014"} bash {"\u2014"} 80{"\u00D7"}24
        </span>
      </div>

      {/* Terminal body */}
      <div
        className="p-6 font-mono text-sm leading-relaxed overflow-x-auto"
        style={{ background: "#0D0D0D", minHeight: 320 }}
      >
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} className="whitespace-pre">
            {line.type === "cmd" && (
              <span className="text-white">{line.text}</span>
            )}
            {line.type === "ok" && (
              <span className="text-[#00E5FF]">{line.text}</span>
            )}
            {line.type === "progress" && (
              <span className="text-[#888]">{line.text}</span>
            )}
            {line.type === "result" && (
              <span className="text-white font-semibold">{line.text}</span>
            )}
            {line.type === "cursor" && (
              <span className="text-white">
                {line.text}
                <span className="animate-blink inline-block w-2 h-4 bg-[#00E5FF] align-middle" />
              </span>
            )}
            {line.type === "blank" && <>&nbsp;</>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   HERO SECTION
   ═══════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section
      className="min-h-screen flex items-center pt-14"
      style={{ background: "#0A0A0A" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10 w-full grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 lg:gap-8 items-center py-16 lg:py-0">
        {/* Left column */}
        <div>
          {/* Beta badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded mb-8 animate-fade-in-up"
            style={{
              border: "1px solid #222",
              background: "#111",
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-sm bg-[#00E5FF] animate-pulse-dot"
            />
            <span
              className="text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase"
            >
              NOW IN BETA
            </span>
          </div>

          {/* Headline */}
          <h1 className="mb-8">
            <span
              className="block text-white animate-fade-in-up"
              style={{
                fontSize: "clamp(48px, 6vw, 80px)",
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
              }}
            >
              AUTOMATE
            </span>
            <span
              className="block text-[#00E5FF] animate-fade-in-up animation-delay-200"
              style={{
                fontSize: "clamp(48px, 6vw, 80px)",
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
              }}
            >
              LINKEDIN.
            </span>
            <span
              className="block text-white animate-fade-in-up animation-delay-400"
              style={{
                fontSize: "clamp(48px, 6vw, 80px)",
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: "-0.04em",
              }}
            >
              SHIP FASTER.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="text-[#888] text-lg leading-relaxed max-w-[460px] mb-8 animate-fade-in-up animation-delay-400"
          >
            InPilot handles job applications, scraping, and posting {"\u2014"} so
            you can focus on building, not clicking.
          </p>

          {/* CTA row */}
          <div className="flex flex-wrap gap-4 mb-8 animate-fade-in-up animation-delay-500">
            <Link
              href="/auth/signup"
              className="inline-flex items-center bg-[#00E5FF] text-black font-bold rounded-md px-6 py-3 text-base cta-hover"
            >
              Start automating &rarr;
            </Link>
            <a
              href="#quickstart"
              className="inline-flex items-center rounded-md px-6 py-3 text-base text-[#888] cta-hover"
              style={{ border: "1px solid #333" }}
            >
              View docs
            </a>
          </div>

          {/* Social proof */}
          <div className="flex items-center gap-3 animate-fade-in-up animation-delay-600">
            <div className="flex -space-x-2">
              {["RK", "SL", "AT", "MJ", "DP"].map((initials, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold text-[#888] shrink-0"
                  style={{
                    background: "#1A1A1A",
                    border: "2px solid #0A0A0A",
                  }}
                >
                  {initials}
                </div>
              ))}
            </div>
            <span className="text-[#555] text-sm">
              Used by 2,400+ developers
            </span>
          </div>
        </div>

        {/* Right column — Terminal */}
        <div className="animate-fade-in-up animation-delay-300">
          <TerminalBlock />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   SOCIAL PROOF BAR
   ═══════════════════════════════════════════════════════════ */

function SocialProofBar() {
  return (
    <section
      className="overflow-hidden"
      style={{
        background: "#111111",
        borderTop: "1px solid #1A1A1A",
        borderBottom: "1px solid #1A1A1A",
        padding: "24px 0",
      }}
    >
      <p className="text-center text-[11px] font-semibold tracking-[0.1em] text-[#444] uppercase mb-4">
        TRUSTED BY ENGINEERS AT
      </p>
      <div className="relative">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...TRUSTED_COMPANIES, ...TRUSTED_COMPANIES].map((name, i) => (
            <span
              key={i}
              className="mx-10 text-[15px] font-semibold text-[#333] hover:text-[#888] transition-colors cursor-default select-none"
            >
              {name}
            </span>
          ))}
          {[...TRUSTED_COMPANIES, ...TRUSTED_COMPANIES].map((name, i) => (
            <span
              key={`dup-${i}`}
              className="mx-10 text-[15px] font-semibold text-[#333] hover:text-[#888] transition-colors cursor-default select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FEATURES / BENTO GRID
   ═══════════════════════════════════════════════════════════ */

type CardDef = {
  label: string;
  title: string;
  body: string;
  icon: (props: { className?: string }) => React.JSX.Element;
  snippet?: string;
  chips?: string[];
  chart?: boolean;
  gridArea: string;
};

const CARDS: CardDef[] = [
  {
    label: "AUTOMATION",
    title: "Job Application Engine",
    body: "Apply to 100+ jobs per day. AI-matched filters, auto-filled forms, personalized cover letters.",
    icon: CursorIcon,
    snippet: "inpilot apply --limit 100 --match-score 0.8",
    gridArea: "a",
  },
  {
    label: "SCRAPING",
    title: "LinkedIn Scraper",
    body: "Extract profiles, emails, company data. Export to JSON, CSV, or pipe directly into your workflow.",
    icon: SearchIcon,
    gridArea: "b",
  },
  {
    label: "CONTENT",
    title: "Post Scheduler",
    body: "Schedule posts with a cron-like syntax. Supports carousels, polls, and text posts.",
    icon: CalendarIcon,
    gridArea: "c",
  },
  {
    label: "INTEGRATIONS",
    title: "API & Webhooks",
    body: "REST API + webhooks. Integrate into your stack in minutes. Full OpenAPI spec included.",
    icon: PlugIcon,
    chips: ["POST /v1/apply", "GET /v1/scrape"],
    gridArea: "d",
  },
  {
    label: "INSIGHTS",
    title: "Analytics Dashboard",
    body: "Track application success rates, profile view spikes, post engagement, and scraping quotas in real time.",
    icon: ChartIcon,
    chart: true,
    gridArea: "e",
  },
];

function MiniBarChart() {
  const heights = [40, 65, 50, 80, 60, 90, 75];
  return (
    <div className="flex items-end gap-1.5 h-16">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-3 rounded-sm"
          style={{
            height: `${h}%`,
            background: "#00E5FF",
            opacity: 0.6 + i * 0.05,
          }}
        />
      ))}
    </div>
  );
}

function BentoCard({ card, delay }: { card: CardDef; delay: number }) {
  const { ref, visible } = useScrollReveal();
  const Icon = card.icon;

  return (
    <div
      ref={ref}
      className={`p-8 rounded-xl transition-all duration-200 ${
        visible ? "animate-fade-in-up" : "opacity-0"
      }`}
      style={{
        gridArea: card.gridArea,
        background: "#111111",
        border: "1px solid #1A1A1A",
        animationDelay: `${delay}ms`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#333";
        e.currentTarget.style.background = "#131313";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1A1A1A";
        e.currentTarget.style.background = "#111111";
      }}
    >
      <div className={`flex ${card.chart ? "justify-between" : "flex-col"}`}>
        <div className={card.chart ? "flex-1" : ""}>
          <Icon className="text-[#00E5FF] mb-4" />
          <span className="block text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase mb-2">
            {card.label}
          </span>
          <h3 className="text-xl font-semibold text-white mb-2">
            {card.title}
          </h3>
          <p className="text-sm text-[#666] leading-relaxed">{card.body}</p>

          {card.snippet && (
            <div className="mt-4 font-mono text-sm text-[#00E5FF] bg-[#0D0D0D] rounded-md px-3 py-2 inline-block">
              {card.snippet}
            </div>
          )}
          {card.chips && (
            <div className="mt-4 flex flex-wrap gap-2">
              {card.chips.map((chip) => (
                <span
                  key={chip}
                  className="font-mono text-xs text-[#00E5FF] bg-[#0D0D0D] rounded px-2 py-1"
                  style={{ border: "1px solid #222" }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
        {card.chart && (
          <div className="flex items-end ml-6">
            <MiniBarChart />
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section
      id="capabilities"
      className="py-[120px]"
      style={{ background: "#0A0A0A" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase mb-4">
          CAPABILITIES
        </p>
        <h2
          className="text-4xl md:text-[48px] font-bold tracking-tight mb-4"
          style={{ letterSpacing: "-0.03em" }}
        >
          Everything LinkedIn. Automated.
        </h2>
        <p className="text-lg text-[#888] mb-16 max-w-xl">
          One SDK. Full control over your LinkedIn presence.
        </p>

        {/* Bento grid */}
        <div
          className="bento-grid grid gap-4 grid-cols-1 md:grid-cols-3"
        >
          {CARDS.map((card, i) => (
            <BentoCard key={card.gridArea} card={card} delay={i * 80} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   HOW IT WORKS — QUICKSTART
   ═══════════════════════════════════════════════════════════ */

function QuickstartSection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section
      id="quickstart"
      className="py-[120px]"
      style={{ background: "#111111" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10" ref={ref}>
        <p className="text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase mb-4">
          QUICKSTART
        </p>
        <h2
          className="text-4xl md:text-[48px] font-bold tracking-tight mb-16"
          style={{ letterSpacing: "-0.03em" }}
        >
          Up and running in 3 minutes.
        </h2>

        {/* Stepper */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Dashed connector — desktop only */}
          <div
            className="hidden md:block absolute top-12 left-[16.6%] right-[16.6%] border-t border-dashed"
            style={{ borderColor: "#333" }}
          />

          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className={`relative ${
                visible ? "animate-fade-in-up" : "opacity-0"
              }`}
              style={{ animationDelay: `${i * 150}ms` }}
            >
              {/* Background number */}
              <span
                className="block text-[96px] font-extrabold leading-none select-none"
                style={{ color: "#1A1A1A" }}
              >
                {step.num}
              </span>
              <h3 className="text-lg font-semibold text-white mt-2 mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-[#666] leading-relaxed mb-4">
                {step.body}
              </p>
              <div
                className="font-mono text-sm text-[#00E5FF] rounded-md px-3 py-2 inline-block"
                style={{ background: "#0D0D0D", border: "1px solid #222" }}
              >
                {step.code}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <a
            href="#quickstart"
            className="inline-flex items-center text-[#00E5FF] font-semibold rounded-md px-6 py-3 cta-hover transition-colors"
            style={{ border: "1px solid #333" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#00E5FF";
              e.currentTarget.style.color = "#000";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#00E5FF";
            }}
          >
            Read the full docs &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRICING
   ═══════════════════════════════════════════════════════════ */

function PricingSection() {
  const { ref, visible } = useScrollReveal();

  return (
    <section
      id="pricing"
      className="py-[120px]"
      style={{ background: "#0A0A0A" }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10" ref={ref}>
        <h2
          className="text-4xl md:text-[48px] font-bold tracking-tight text-center mb-4"
          style={{ letterSpacing: "-0.03em" }}
        >
          Simple, usage-based pricing.
        </h2>
        <p className="text-lg text-[#888] text-center mb-16">
          Pay for what you automate. No seat fees.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan, i) => (
            <div
              key={plan.name}
              className={`rounded-xl p-10 flex flex-col ${
                visible ? "animate-fade-in-up" : "opacity-0"
              }`}
              style={{
                background: "#111111",
                border: plan.highlighted
                  ? "1px solid #00E5FF"
                  : "1px solid #1A1A1A",
                boxShadow: plan.highlighted
                  ? "0 0 40px rgba(0,229,255,0.08)"
                  : "none",
                animationDelay: `${i * 100}ms`,
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <h3 className="text-xl font-semibold text-white">
                  {plan.name}
                </h3>
                {plan.badge && (
                  <span className="text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase bg-[rgba(0,229,255,0.09)] px-2 py-0.5 rounded">
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="mb-8">
                <span className="text-4xl font-bold text-white">
                  {plan.price}
                </span>
                <span className="text-[#888] ml-1">{plan.period}</span>
              </div>

              <ul className="flex-1 space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-[#00E5FF] mt-0.5">&check;</span>
                    <span className="text-[#888]">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded-md font-semibold text-sm cta-hover transition-colors ${
                  plan.highlighted
                    ? "bg-[#00E5FF] text-black hover:opacity-90"
                    : "text-[#888] hover:text-white hover:border-white"
                }`}
                style={
                  plan.highlighted
                    ? undefined
                    : { border: "1px solid #333", background: "transparent" }
                }
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   TESTIMONIALS
   ═══════════════════════════════════════════════════════════ */

function TestimonialsSection() {
  const { ref, visible } = useScrollReveal();

  const columns = [
    TESTIMONIALS.filter((_, i) => i % 3 === 0),
    TESTIMONIALS.filter((_, i) => i % 3 === 1),
    TESTIMONIALS.filter((_, i) => i % 3 === 2),
  ];

  return (
    <section className="py-[100px]" style={{ background: "#111111" }}>
      <div className="max-w-[1200px] mx-auto px-5 md:px-10" ref={ref}>
        <h2
          className="text-4xl md:text-[48px] font-bold tracking-tight mb-16"
          style={{ letterSpacing: "-0.03em" }}
        >
          What developers say.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-4">
              {col.map((t, ti) => (
                <div
                  key={ti}
                  className={`rounded-xl p-6 ${
                    visible ? "animate-fade-in-up" : "opacity-0"
                  }`}
                  style={{
                    background: "#0A0A0A",
                    border: "1px solid #1A1A1A",
                    animationDelay: `${(ci * 2 + ti) * 80}ms`,
                  }}
                >
                  <p className="text-[15px] text-[#888] leading-relaxed mb-4">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-[#888] shrink-0"
                      style={{ background: "#1A1A1A" }}
                    >
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {t.name}
                      </p>
                      <p className="text-xs text-[#555]">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════════════════════ */

function FinalCTASection() {
  return (
    <section
      className="py-[160px] text-center relative"
      style={{
        background: "#0A0A0A",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10 relative z-10">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-[#00E5FF] uppercase mb-6">
          START TODAY
        </p>
        <h2
          className="text-4xl md:text-[64px] font-extrabold tracking-tight mb-6"
          style={{ letterSpacing: "-0.03em" }}
        >
          Stop clicking. Start automating.
        </h2>
        <p className="text-lg text-[#888] mb-10 max-w-xl mx-auto">
          Join 2,400+ developers using InPilot to run LinkedIn on autopilot.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <Link
            href="/auth/signup"
            className="inline-flex items-center bg-[#00E5FF] text-black font-bold rounded-md px-6 py-3 text-base cta-hover"
          >
            Get started free &rarr;
          </Link>
          <a
            href="mailto:founders@inpilot.app"
            className="inline-flex items-center rounded-md px-6 py-3 text-base text-[#888] cta-hover"
            style={{ border: "1px solid #333" }}
          >
            Talk to a founder
          </a>
        </div>

        <p className="text-[13px] text-[#444]">
          No credit card required &middot; Cancel anytime &middot; Open API
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════ */

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#capabilities" },
      { label: "Pricing", href: "#pricing" },
      { label: "Changelog", href: "#" },
      { label: "Roadmap", href: "#" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "#quickstart" },
      { label: "API Reference", href: "#" },
      { label: "SDKs", href: "#" },
      { label: "Status", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

function Footer() {
  return (
    <footer
      id="footer"
      style={{
        background: "#0A0A0A",
        borderTop: "1px solid #1A1A1A",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-5 md:px-10 pt-[60px] pb-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Col 1 — Logo */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#00E5FF] text-xs">&#9632;</span>
              <span className="text-white font-bold text-lg">InPilot</span>
            </div>
            <p className="text-sm text-[#444] mb-4">LinkedIn, automated.</p>
            <div className="flex gap-4">
              {/* GitHub */}
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#444] hover:text-[#888] transition-colors"
                aria-label="GitHub"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
              {/* X / Twitter */}
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#444] hover:text-[#888] transition-colors"
                aria-label="X"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Other columns */}
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-[#444] hover:text-[#888] transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col md:flex-row justify-between items-center pt-6 gap-4"
          style={{ borderTop: "1px solid #1A1A1A" }}
        >
          <p className="text-xs text-[#444]">
            &copy; 2025 InPilot. Built for developers, by developers.
          </p>
          <div className="flex gap-4">
            <Link
              href="/terms"
              className="text-xs text-[#444] hover:text-[#888] transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-[#444] hover:text-[#888] transition-colors"
            >
              Privacy
            </Link>
            <a
              href="#"
              className="text-xs text-[#444] hover:text-[#888] transition-colors"
            >
              Status
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <>
      <a href="#main" className="skip-to-content">
        Skip to content
      </a>
      <Navigation />
      <main id="main">
        <HeroSection />
        <SocialProofBar />
        <FeaturesSection />
        <QuickstartSection />
        <PricingSection />
        <TestimonialsSection />
        <FinalCTASection />
      </main>
      <Footer />
    </>
  );
}
