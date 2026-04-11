import type { Metadata } from "next";
import {
  Heart,
  Globe,
  Shield,
  Users,
  Code,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { InfoPageLayout } from "@/components/info-page-layout";
import { SectionHeading } from "@/components/section-heading";
import { FeatureCard } from "@/components/feature-card";
import { PremiumButton } from "@/components/premium-button";

export const metadata: Metadata = {
  title: "About",
  description:
    "LinkedBoost is a free, open-source LinkedIn automation platform. Learn about our mission to democratize professional networking.",
  openGraph: {
    title: "About — LinkedBoost",
    description:
      "Learn about our mission to make LinkedIn automation accessible to everyone.",
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

const techStack = [
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
];

export default function AboutPage() {
  return (
    <InfoPageLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pb-32">
        <div className="aurora-bg opacity-40" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center z-10">
          <SectionHeading
            title="Automating LinkedIn for everyone"
            subtitle="LinkedBoost was born from a simple frustration: existing LinkedIn automation tools are either overpriced, privacy-invasive, or dangerously detectable. We built something better."
            centered
            gradient
          />
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-20 md:py-32 border-t border-var(--border-color) bg-var(--bg-secondary)">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="glass rounded-2xl p-8 md:p-12 space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold text-var(--text-primary)">Our Mission</h2>
            <p className="text-lg text-var(--text-secondary) leading-relaxed">
              We believe that everyone deserves access to powerful automation tools — not just those who can afford $99/month subscriptions. LinkedBoost is completely free, forever. You bring your own AI keys (many have generous free tiers), and we provide the entire platform. No catch. No upsells. Just great software.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Our Values"
            subtitle="What guides every decision we make"
            centered
            gradient
            className="mb-16 md:mb-20"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {values.map((value) => (
              <FeatureCard
                key={value.title}
                icon={<value.icon className="w-6 h-6" />}
                title={value.title}
                description={value.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 md:py-32 border-t border-var(--border-color) bg-var(--bg-secondary)">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <SectionHeading
            title="Built with modern tech"
            subtitle="LinkedBoost uses battle-tested, modern technologies for reliability and performance."
            centered
            gradient={false}
            className="mb-12 md:mb-16"
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-lg border border-var(--border-color) bg-var(--bg-tertiary) px-3 py-2 text-sm font-medium text-var(--text-secondary) hover:text-var(--accent-cyan) hover:border-var(--accent-cyan) transition-colors"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <SectionHeading
            title="Join LinkedBoost today"
            subtitle="Free forever. Open source. Community driven."
            centered
            gradient={false}
            className="mb-8 md:mb-10"
          />

          <PremiumButton
            variant="primary"
            size="lg"
            href="/register"
            glowing
            className="text-base"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4" />
          </PremiumButton>
        </div>
      </section>
    </InfoPageLayout>
  );
}
