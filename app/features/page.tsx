import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  Briefcase,
  Trophy,
  Database,
  ArrowRight,
  Shield,
  Sparkles,
  Target,
  Eye,
  BarChart3,
  MessageSquare,
  Users,
  Calendar,
  FileText,
  Bot,
  Layers,
  Clock,
  TrendingUp,
  Search,
  Bell,
  Settings,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Features — LinkedIn Job Automation & Auto Apply",
  description:
    "Explore WinPilot features: AI-powered automatic LinkedIn job applications, Easy Apply automation, intelligent resume tailoring, LinkedIn scraping, and human-level anti-detection.",
  openGraph: {
    title: "WinPilot Features — Auto Apply to LinkedIn Jobs",
    description:
      "Automatically apply to LinkedIn jobs, tailor your resume with AI, and scrape leads — all with WinPilot's powerful automation engine.",
  },
};

const pillarFeatures = [
  {
    id: "auto-apply",
    icon: Briefcase,
    color: "blue",
    title: "Smart Auto-Apply",
    tagline: "Apply to 15+ jobs daily while you sleep",
    description:
      "AI reads job descriptions, tailors your resume on the fly, and fills every Easy Apply form automatically. Track every application from submission to offer.",
    features: [
      { icon: Target, text: "AI resume tailoring per job description" },
      { icon: Sparkles, text: "Smart form filling with learned answers" },
      { icon: Eye, text: "Job match scoring (0-100%)" },
      { icon: FileText, text: "Multiple resume support with variants" },
      { icon: Search, text: "Saved searches with scheduling" },
      { icon: BarChart3, text: "Application funnel analytics" },
    ],
  },
  {
    id: "hero-mode",
    icon: Trophy,
    color: "purple",
    title: "Become a Hero",
    tagline: "Build LinkedIn authority on autopilot",
    description:
      "AI generates viral posts in your voice, auto-engages with your niche, and manages your content calendar. Grow your following without spending hours on content creation.",
    features: [
      { icon: Bot, text: "AI content generation in your voice" },
      { icon: Calendar, text: "Visual content calendar & scheduling" },
      { icon: Users, text: "Group discovery & cross-posting" },
      { icon: MessageSquare, text: "Automated engagement & commenting" },
      { icon: TrendingUp, text: "Post performance analytics" },
      { icon: Layers, text: "Content pillar strategy" },
    ],
  },
  {
    id: "scraper",
    icon: Database,
    color: "amber",
    title: "Smart Scraper",
    tagline: "Turn LinkedIn into your lead machine",
    description:
      "Find people actively looking for your services. AI writes personalized outreach messages. Manage your entire sales pipeline from discovery to conversion.",
    features: [
      { icon: Search, text: "Keyword-based post & profile scraping" },
      { icon: MessageSquare, text: "AI personalized outreach messages" },
      { icon: Users, text: "Lead management with status tracking" },
      { icon: Target, text: "Relevance scoring for leads" },
      { icon: FileText, text: "Template library with variables" },
      { icon: BarChart3, text: "Outreach conversion analytics" },
    ],
  },
];

const platformFeatures = [
  {
    icon: Shield,
    title: "Human-Level Anti-Detection",
    description: "Gaussian-distributed delays, natural mouse movements, session limits, and smart cooldowns keep your account safe.",
  },
  {
    icon: Bot,
    title: "BYOK AI Integration",
    description: "Bring your own API keys from Gemini, OpenAI, Anthropic, or Groq. AES-256-GCM encryption at rest.",
  },
  {
    icon: BarChart3,
    title: "Comprehensive Analytics",
    description: "Track applications, post engagement, lead conversions, and safety scores with beautiful charts.",
  },
  {
    icon: Bell,
    title: "Real-Time Notifications",
    description: "Instant alerts for applications, posts, leads, and safety warnings via in-app and extension notifications.",
  },
  {
    icon: Clock,
    title: "Smart Scheduling",
    description: "Set working hours, daily limits, and speed preferences. Winpilot works within your safety parameters.",
  },
  {
    icon: Settings,
    title: "Chrome Extension",
    description: "Manifest V3 extension operates on your logged-in LinkedIn session. No password sharing required.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1C]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-6xl px-6 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0A0F1C]/80 backdrop-blur-2xl px-6 py-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/25">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Winpilot</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <Link href="/features" className="text-sm text-white font-medium">Features</Link>
              <Link href="/about" className="text-sm text-white/50 hover:text-white transition-colors">About</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-white text-[#0A0F1C] hover:bg-white/90 font-semibold shadow-lg shadow-white/10">
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="text-sm font-medium text-blue-400 uppercase tracking-[0.2em] mb-4">Features</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">
            Everything you need to
            <br />
            <span className="gradient-text">dominate LinkedIn</span>
          </h1>
          <p className="mt-6 text-lg text-white/40 max-w-2xl mx-auto">
            Three powerful automation pillars backed by AI, wrapped in human-level anti-detection.
          </p>
        </div>
      </section>

      {/* Three Pillars - Detailed */}
      {pillarFeatures.map((pillar, i) => (
        <section
          key={pillar.id}
          id={pillar.id}
          className={`py-24 ${i % 2 === 1 ? "bg-white/2" : ""} border-t border-white/5`}
        >
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-${pillar.color}-500/10 ring-1 ring-${pillar.color}-500/20 mb-6`}>
                  <pillar.icon className={`h-7 w-7 text-${pillar.color}-400`} />
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
                  {pillar.title}
                </h2>
                <p className={`text-lg text-${pillar.color}-400/80 font-medium mb-4`}>{pillar.tagline}</p>
                <p className="text-white/40 leading-relaxed text-base mb-8">{pillar.description}</p>
                <Link href="/register">
                  <Button className="bg-blue-600 hover:bg-blue-500">
                    Get Started Free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pillar.features.map((feature) => (
                    <div
                      key={feature.text}
                      className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/3 p-5 hover:border-white/15 transition-colors"
                    >
                      <feature.icon className={`h-5 w-5 text-${pillar.color}-400/70 shrink-0 mt-0.5`} />
                      <span className="text-sm text-white/60">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Platform Features Grid */}
      <section className="py-24 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-medium text-emerald-400 uppercase tracking-[0.2em] mb-4">Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Built for <span className="gradient-text">safety & scale</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platformFeatures.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-white/8 bg-white/3 p-7 hover:border-white/15 transition-colors"
              >
                <feature.icon className="h-8 w-8 text-blue-400/70 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* comparison */}
      <section className="py-24 border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Why <span className="gradient-text">Winpilot</span>?
            </h2>
            <p className="text-white/40">See how we compare to paid alternatives.</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="text-left text-sm text-white/40 font-medium p-4">Feature</th>
                  <th className="text-center text-sm font-semibold text-blue-400 p-4">Winpilot</th>
                  <th className="text-center text-sm text-white/30 font-medium p-4">Others</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Price", "Free forever", "$29-99/mo"],
                  ["AI Resume Tailoring", true, false],
                  ["BYOK (Your own API keys)", true, false],
                  ["Anti-Detection Engine", true, "Basic"],
                  ["Content Generation", true, "Limited"],
                  ["Lead Scraping", true, "Paid add-on"],
                  ["Open Source", true, false],
                  ["Data Encryption", "AES-256-GCM", "Varies"],
                ].map(([feature, ours, theirs]) => (
                  <tr key={feature as string} className="border-b border-white/5 last:border-0">
                    <td className="text-sm text-white/60 p-4">{feature as string}</td>
                    <td className="text-center p-4">
                      {ours === true ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto" />
                      ) : (
                        <span className="text-sm text-emerald-400 font-medium">{ours as string}</span>
                      )}
                    </td>
                    <td className="text-center p-4">
                      {theirs === false ? (
                        <span className="text-sm text-white/20">--</span>
                      ) : (
                        <span className="text-sm text-white/30">{theirs as string}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/5">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-6">
            Ready to <span className="gradient-text">get started</span>?
          </h2>
          <p className="text-lg text-white/40 mb-10">Free forever. No credit card. No feature gates.</p>
          <Link href="/register">
            <Button size="lg" className="text-base px-10 h-14 bg-white text-[#0A0F1C] hover:bg-white/90 font-semibold shadow-2xl shadow-white/10">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">Winpilot</span>
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/features" className="text-xs text-white/30 hover:text-white/50 transition-colors">Features</Link>
              <Link href="/about" className="text-xs text-white/30 hover:text-white/50 transition-colors">About</Link>
              <Link href="/privacy" className="text-xs text-white/30 hover:text-white/50 transition-colors">Privacy</Link>
              <Link href="/terms" className="text-xs text-white/30 hover:text-white/50 transition-colors">Terms</Link>
            </div>
            <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} Winpilot. Free and open source.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
