import type { Metadata } from "next";
import Link from "next/link";
import {
  Zap,
  ArrowRight,
  Heart,
  Globe,
  Shield,
  Users,
  Code,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About WinPilot — LinkedIn Job Automation",
  description:
    "WinPilot is the leading LinkedIn job automation platform. Learn about our mission to help job seekers automatically apply to hundreds of LinkedIn jobs with AI.",
  openGraph: {
    title: "About WinPilot — LinkedIn Job Automation",
    description:
      "Learn about our mission to help job seekers land jobs faster with automated LinkedIn job applications.",
  },
};

const values = [
  {
    icon: Heart,
    title: "Free Forever",
    description:
      "No premium tiers, no credit cards, no feature gates. Every feature is available to every user from day one.",
  },
  {
    icon: Shield,
    title: "Privacy First",
    description:
      "Your API keys are encrypted with AES-256-GCM. We never see your unencrypted keys, never sell your data, and never track you.",
  },
  {
    icon: Code,
    title: "Open Source",
    description:
      "Every line of code is transparent and auditable. You can self-host, modify, and contribute to the project freely.",
  },
  {
    icon: Globe,
    title: "BYOK Model",
    description:
      "Bring Your Own Key means you control your AI costs. Use free tiers from Gemini or Groq, or your own paid keys for higher quality.",
  },
  {
    icon: Users,
    title: "Community Driven",
    description:
      "Built by the community, for the community. Feature requests, bug reports, and pull requests are all welcome.",
  },
  {
    icon: Sparkles,
    title: "Best-in-Class",
    description:
      "We aim to build the best LinkedIn automation tool available — not the most profitable one. Quality over monetization.",
  },
];

export default function AboutPage() {
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
              <Link href="/features" className="text-sm text-white/50 hover:text-white transition-colors">Features</Link>
              <Link href="/about" className="text-sm text-white font-medium">About</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-white text-[#0A0F1C] hover:bg-white/90 font-semibold">
                  Get Started <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-sm font-medium text-blue-400 uppercase tracking-[0.2em] mb-4">About</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight">
            Automating LinkedIn
            <br />
            <span className="gradient-text">for everyone</span>
          </h1>
          <p className="mt-6 text-lg text-white/40 max-w-2xl mx-auto leading-relaxed">
            Winpilot was born from a simple frustration: existing LinkedIn automation tools are
            either overpriced, privacy-invasive, or dangerously detectable. We built something better.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6">
          <div className="rounded-3xl border border-white/8 bg-white/3 p-10 sm:p-14">
            <h2 className="text-2xl font-bold text-white mb-4">Our Mission</h2>
            <p className="text-white/50 leading-relaxed text-lg">
              We believe that everyone deserves access to powerful automation tools — not just those
              who can afford $99/month subscriptions. Winpilot is completely free, forever. You bring
              your own AI keys (many have generous free tiers), and we provide the entire platform.
              No catch. No upsells. Just great software.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Our <span className="gradient-text">Values</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-white/8 bg-white/3 p-7 hover:border-white/15 transition-colors"
              >
                <value.icon className="h-8 w-8 text-blue-400/70 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">{value.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white tracking-tight mb-4">
            Built with <span className="gradient-text">modern tech</span>
          </h2>
          <p className="text-white/40 mb-10">
            Winpilot uses battle-tested, modern technologies for reliability and performance.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {[
              "Next.js 16",
              "React 19",
              "TypeScript 5",
              "Tailwind CSS v4",
              "MongoDB Atlas",
              "NextAuth.js v5",
              "Socket.IO",
              "Chrome Extension (MV3)",
              "Zustand",
              "Radix UI",
              "Framer Motion",
              "Zod",
            ].map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/50"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 border-t border-white/5">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-6">
            Join <span className="gradient-text">Winpilot</span> today
          </h2>
          <p className="text-lg text-white/40 mb-10">Free forever. Open source. Community driven.</p>
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
