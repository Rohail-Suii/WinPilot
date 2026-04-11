import type { Metadata } from "next";
import {
  Briefcase,
  Trophy,
  Database,
  Shield,
  Bot,
  BarChart3,
  Bell,
  Clock,
  Settings,
  Target,
  Sparkles,
  Eye,
  FileText,
  Search,
  MessageSquare,
  Users,
  Calendar,
  TrendingUp,
  Layers,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { InfoPageLayout } from "@/components/info-page-layout";
import { SectionHeading } from "@/components/section-heading";
import { FeatureCard } from "@/components/feature-card";
import { PremiumCard } from "@/components/premium-card";
import { PremiumButton } from "@/components/premium-button";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore LinkedBoost features: AI-powered job applications, personal brand building, intelligent lead scraping, and human-level anti-detection.",
  openGraph: {
    title: "Features — LinkedBoost",
    description:
      "Auto-apply to jobs, build your personal brand, and scrape leads on LinkedIn — completely free with BYOK AI.",
  },
};

const pillarFeatures = [
  {
    id: "auto-apply",
    icon: Briefcase,
    title: "Smart Auto-Apply",
    tagline: "Apply to 15+ jobs daily while you sleep",
    description:
      "AI reads job descriptions, tailors your resume on the fly, and fills every Easy Apply form automatically. Track every application from submission to offer.",
    details: [
      "AI resume tailoring per job description",
      "Smart form filling with learned answers",
      "Job match scoring (0-100%)",
      "Multiple resume support with variants",
      "Saved searches with scheduling",
      "Application funnel analytics",
    ],
  },
  {
    id: "hero-mode",
    icon: Trophy,
    title: "Become a Hero",
    tagline: "Build LinkedIn authority on autopilot",
    description:
      "AI generates viral posts in your voice, auto-engages with your niche, and manages your content calendar. Grow your following without spending hours on content creation.",
    details: [
      "AI content generation in your voice",
      "Visual content calendar & scheduling",
      "Group discovery & cross-posting",
      "Automated engagement & commenting",
      "Post performance analytics",
      "Content pillar strategy",
    ],
  },
  {
    id: "scraper",
    icon: Database,
    title: "Smart Scraper",
    tagline: "Turn LinkedIn into your lead machine",
    description:
      "Find people actively looking for your services. AI writes personalized outreach messages. Manage your entire sales pipeline from discovery to conversion.",
    details: [
      "Keyword-based post & profile scraping",
      "AI personalized outreach messages",
      "Lead management with status tracking",
      "Relevance scoring for leads",
      "Template library with variables",
      "Outreach conversion analytics",
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
    description: "Set working hours, daily limits, and speed preferences. LinkedBoost works within your safety parameters.",
  },
  {
    icon: Settings,
    title: "Chrome Extension",
    description: "Manifest V3 extension operates on your logged-in LinkedIn session. No password sharing required.",
  },
];

export default function FeaturesPage() {
  return (
    <InfoPageLayout>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pb-32">
        <div className="aurora-bg opacity-40" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center z-10">
          <SectionHeading
            title="Everything you need to dominate LinkedIn"
            subtitle="Three powerful automation pillars backed by AI, wrapped in human-level anti-detection."
            centered
            gradient
          />
        </div>
      </section>

      {/* Three Pillars - Detailed */}
      {pillarFeatures.map((pillar, i) => (
        <section
          key={pillar.id}
          id={pillar.id}
          className={`py-20 md:py-32 ${i > 0 ? "border-t border-var(--border-color)" : ""} ${i % 2 === 1 ? "bg-var(--bg-secondary)" : ""}`}
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta) text-var(--text-inverse)">
                    <pillar.icon className="h-7 w-7" />
                  </div>
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-var(--text-primary) tracking-tight mb-3">
                  {pillar.title}
                </h2>
                <p className="text-lg text-var(--accent-cyan) font-medium mb-4">{pillar.tagline}</p>
                <p className="text-var(--text-secondary) leading-relaxed text-base mb-8">{pillar.description}</p>
                <PremiumButton
                  variant="primary"
                  size="lg"
                  href="/register"
                  className="text-base"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </PremiumButton>
              </div>
              
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {pillar.details.map((detail) => (
                    <PremiumCard
                      key={detail}
                      glassEffect
                      hoverable
                      className="p-4 flex items-start gap-3"
                    >
                      <CheckCircle2 className="h-5 w-5 text-var(--accent-cyan) flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-var(--text-secondary)">{detail}</span>
                    </PremiumCard>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ))}

      {/* Platform Features Grid */}
      <section className="py-20 md:py-32 border-t border-var(--border-color) bg-var(--bg-secondary)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Built for safety & scale"
            subtitle="Enterprise-grade platform features"
            centered
            gradient={false}
            className="mb-16 md:mb-20"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platformFeatures.map((feature) => (
              <FeatureCard
                key={feature.title}
                icon={<feature.icon className="w-6 h-6" />}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionHeading
            title="Why LinkedBoost?"
            subtitle="See how we compare to paid alternatives"
            centered
            gradient={false}
            className="mb-16"
          />

          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-var(--border-color)">
                    <th className="text-left text-sm text-var(--text-secondary) font-semibold p-4">Feature</th>
                    <th className="text-center text-sm font-semibold text-var(--accent-cyan) p-4">LinkedBoost</th>
                    <th className="text-center text-sm text-var(--text-tertiary) font-medium p-4">Others</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Price", "Free forever", "$29-99/mo"],
                    ["AI Resume Tailoring", "✓", "✗"],
                    ["BYOK (Your own API keys)", "✓", "✗"],
                    ["Anti-Detection Engine", "✓", "Basic"],
                    ["Content Generation", "✓", "Limited"],
                    ["Lead Scraping", "✓", "Paid add-on"],
                    ["Open Source", "✓", "✗"],
                    ["Data Encryption", "AES-256-GCM", "Varies"],
                  ].map(([feature, ours, theirs]) => (
                    <tr key={feature as string} className="border-b border-var(--border-color) last:border-0 hover:bg-var(--bg-tertiary) transition-colors">
                      <td className="text-sm text-var(--text-primary) p-4 font-medium">{feature as string}</td>
                      <td className="text-center p-4">
                        {ours === "✓" ? (
                          <CheckCircle2 className="h-5 w-5 text-var(--accent-cyan) mx-auto" />
                        ) : (
                          <span className="text-sm text-var(--accent-cyan) font-medium">{ours as string}</span>
                        )}
                      </td>
                      <td className="text-center p-4">
                        {theirs === "✗" ? (
                          <span className="text-sm text-var(--text-tertiary)">—</span>
                        ) : (
                          <span className="text-sm text-var(--text-tertiary)">{theirs as string}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 border-t border-var(--border-color) bg-var(--bg-secondary)">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <SectionHeading
            title="Ready to get started?"
            subtitle="Free forever. No credit card. No feature gates."
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
