import {
  Zap,
  Briefcase,
  Trophy,
  Database,
  ArrowRight,
  Shield,
  Key,
  Github,
  Lock,
  Sparkles,
  Target,
  Rocket,
  Eye,
  BarChart3,
  CheckCircle2,
} from "lucide-react";
import { PremiumHeader } from "@/components/premium-header";
import { PremiumFooter } from "@/components/premium-footer";
import { PremiumButton } from "@/components/premium-button";
import { SectionHeading } from "@/components/section-heading";
import { FeatureCard } from "@/components/feature-card";
import { TestimonialCard } from "@/components/testimonial-card";
import { PricingCard } from "@/components/pricing-card";

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LinkedBoost",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    description:
      "Premium LinkedIn automation powered by AI. Auto-apply to jobs, build your personal brand, and generate qualified leads — completely free with BYOK model.",
  };

  return (
    <div className="min-h-screen bg-var(--bg-primary) overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PremiumHeader />

      {/* ═══════════════════════════════════════════════════════════
          HERO SECTION — Cinematic with gradient and aurora effects
          ═══════════════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-24 pb-32">
        {/* Aurora gradient background */}
        <div className="aurora-bg" />
        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-40" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center z-10">
          {/* Badge */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-var(--border-color) bg-var(--glass-bg) backdrop-blur-sm px-4 py-2 text-sm mb-8">
            <Github className="h-4 w-4 text-var(--accent-cyan)" />
            <span className="text-var(--text-secondary)">Free & Open Source</span>
            <span className="text-var(--text-primary) font-medium">with BYOK AI</span>
            <ArrowRight className="h-3 w-3 text-var(--text-tertiary)" />
          </div>

          {/* Headline */}
          <h1 className="animate-fade-in-up animation-delay-100 text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold text-var(--text-primary) leading-[1.05] tracking-tight max-w-4xl mx-auto text-balance">
            LinkedIn on
            <br />
            <span className="gradient-text">Autopilot</span>
          </h1>

          {/* Subheading */}
          <p className="animate-fade-in-up animation-delay-200 mt-6 text-lg sm:text-xl text-var(--text-secondary) max-w-2xl mx-auto leading-relaxed">
            AI-powered job applications, viral content creation, and intelligent lead scraping.
            Completely free. Bring your own API key.
          </p>

          {/* CTAs */}
          <div className="animate-fade-in-up animation-delay-300 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <PremiumButton
              variant="primary"
              size="lg"
              href="/register"
              glowing
              className="text-base"
            >
              Start Free — No Credit Card
              <ArrowRight className="h-4 w-4" />
            </PremiumButton>
            <PremiumButton
              variant="outline"
              size="lg"
              href="#features"
            >
              Explore Features
            </PremiumButton>
          </div>

          {/* Social proof stats */}
          <div className="animate-fade-in-up animation-delay-400 mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-var(--accent-cyan) glow-soft">100%</p>
              <p className="text-xs text-var(--text-tertiary) mt-1">Free Forever</p>
            </div>
            <div className="h-8 w-px bg-var(--border-color)" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-var(--accent-magenta) glow-soft">AES-256</p>
              <p className="text-xs text-var(--text-tertiary) mt-1">Encryption</p>
            </div>
            <div className="h-8 w-px bg-var(--border-color)" />
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-var(--accent-amber) glow-soft">BYOK</p>
              <p className="text-xs text-var(--text-tertiary) mt-1">Your Keys, Your Data</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          TECH STACK SECTION
          ═══════════════════════════════════════════════════════════ */}
      <section className="border-y border-var(--border-color) py-10 bg-var(--bg-secondary)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs text-var(--text-tertiary) uppercase tracking-[0.2em] mb-6">Built with industry-leading technology</p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14">
            {["Next.js 16", "React 19", "MongoDB", "TypeScript", "Tailwind CSS", "Chrome Extension"].map((tech) => (
              <span key={tech} className="text-sm font-medium text-var(--text-tertiary) hover:text-var(--accent-cyan) transition-colors">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FEATURES SHOWCASE — Premium cards with icons
          ═══════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 md:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Everything you need to dominate LinkedIn"
            subtitle="Three powerful pillars of automation, powered by your own AI keys"
            centered
            gradient
            className="mb-16 md:mb-20"
          />

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <FeatureCard
              icon={<Briefcase className="w-6 h-6" />}
              title="Smart Auto-Apply"
              description="AI reads job descriptions, tailors your resume on the fly, and fills every Easy Apply form automatically."
              badge="Most Used"
              details={[
                "AI Resume Tailoring",
                "Smart Form Filling",
                "Job Match Scoring",
                "Application Analytics",
              ]}
              className="lg:col-span-1"
            />

            {/* Feature 2 */}
            <FeatureCard
              icon={<Trophy className="w-6 h-6" />}
              title="Become a Hero"
              description="AI generates viral posts in your voice. Auto-engage with your niche. Grow your following on autopilot."
              badge="Going Viral"
              details={[
                "Content generation",
                "Group auto-posting",
                "Engagement automation",
              ]}
              className="lg:col-span-1"
            />

            {/* Feature 3 */}
            <FeatureCard
              icon={<Database className="w-6 h-6" />}
              title="Smart Scraper"
              description="Find people looking for your services. AI writes personalized outreach. Turn LinkedIn into your lead machine."
              badge="Lead Gen"
              details={[
                "Profile & post scraping",
                "AI personalized outreach",
                "Lead management",
              ]}
              className="lg:col-span-1"
            />

            {/* Feature 4 - Anti-Detection (spans 2 columns on lg) */}
            <FeatureCard
              icon={<Shield className="w-6 h-6" />}
              title="Human-Level Anti-Detection"
              description="Gaussian-distributed delays, natural mouse movements, and smart session management. Your account stays safe — always."
              badge="Enterprise Grade"
              details={[
                "Gaussian timing",
                "Session limits",
                "Daily caps",
                "Cooldown periods",
              ]}
              className="lg:col-span-2"
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          HOW IT WORKS — Vertical timeline
          ═══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <SectionHeading
            title="Up and running in three minutes"
            subtitle="Simple setup, powerful results"
            centered
            gradient
            className="mb-16 md:mb-20"
          />

          <div className="space-y-0">
            {[
              {
                step: "01",
                title: "Add Your AI Key",
                description: "Paste your free Gemini or Groq API key. We encrypt it with AES-256-GCM — we never see it unencrypted.",
                icon: Key,
              },
              {
                step: "02",
                title: "Upload Your Resume",
                description: "Upload your PDF. AI parses and structures it. For each job, AI creates a perfectly tailored version.",
                icon: Rocket,
              },
              {
                step: "03",
                title: "Install Extension & Go",
                description: "Install the Chrome extension, set your preferences, and watch LinkedBoost work while you focus on what matters.",
                icon: Zap,
              },
            ].map((item, index) => (
              <div key={item.step} className="relative flex gap-6 md:gap-8 group pb-12 md:pb-16 last:pb-0">
                {/* Timeline line */}
                {index < 2 && (
                  <div className="absolute left-6 top-16 w-px h-20 md:h-24 bg-gradient-to-b from-var(--border-color) to-transparent" />
                )}
                {/* Step circle */}
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-var(--accent-cyan) text-var(--text-inverse) font-bold transition-all group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-var(--accent-cyan)/50">
                  <item.icon className="h-5 w-5" />
                </div>
                {/* Content */}
                <div className="flex-1">
                  <span className="text-xs font-mono text-var(--text-tertiary) uppercase tracking-wider">Step {item.step}</span>
                  <h3 className="text-xl font-bold text-var(--text-primary) mt-2 mb-2">{item.title}</h3>
                  <p className="text-var(--text-secondary) leading-relaxed max-w-md">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          TESTIMONIALS — Social Proof
          ═══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Loved by professionals worldwide"
            subtitle="Real results from real users"
            centered
            gradient={false}
            className="mb-16 md:mb-20"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TestimonialCard
              quote="LinkedBoost increased my job application success rate by 300%. The AI resume tailoring is insanely accurate."
              author="Sarah Chen"
              title="Product Manager at Tech Corp"
              rating={5}
            />

            <TestimonialCard
              quote="I went from 5k to 50k LinkedIn followers in 3 months using the content automation. Best decision ever."
              author="Marcus Johnson"
              title="Freelance Consultant"
              rating={5}
            />

            <TestimonialCard
              quote="The lead scraping feature found me 200+ qualified prospects. Converted 15 into clients. This tool pays for itself."
              author="Elena Rodriguez"
              title="B2B Sales Director"
              rating={5}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          PRICING — Clear and Simple
          ═══════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 md:py-32 border-t border-var(--border-color)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Transparent, guilt-free pricing"
            subtitle="One simple plan. All features included. Forever free."
            centered
            gradient
            className="mb-16 md:mb-20"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Starter */}
            <PricingCard
              name="Personal"
              description="Perfect for job seekers"
              price="Free"
              period="Forever"
              features={[
                "Smart Auto-Apply",
                "Up to 15 applications/day",
                "Resume tailoring",
                "Basic analytics",
                "Community support",
              ]}
              cta="Get Started"
              ctaVariant="outline"
              ctaHref="/register"
            />

            {/* Professional - Highlighted */}
            <PricingCard
              name="Professional"
              description="For LinkedIn growth"
              price="Free"
              period="Forever"
              features={[
                "Everything in Personal +",
                "Content generation",
                "Viral post automation",
                "Engagement automation",
                "1000+ followers/month",
                "Premium support",
              ]}
              cta="Get Started"
              ctaVariant="primary"
              ctaHref="/register"
              highlighted
              badge="Most Popular"
            />

            {/* Enterprise */}
            <PricingCard
              name="Enterprise"
              description="For sales & recruitment"
              price="Free"
              period="Forever"
              features={[
                "Everything in Professional +",
                "Smart Scraper",
                "Lead generation",
                "Personalized outreach",
                "Lead management",
                "Dedicated support",
              ]}
              cta="Get Started"
              ctaVariant="outline"
              ctaHref="/register"
            />
          </div>

          <p className="text-center text-var(--text-tertiary) text-sm mt-12">
            All plans are completely free. No credit card required. No feature gates. No catch.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          SECURITY & TRUST
          ═══════════════════════════════════════════════════════════ */}
      <section className="py-20 md:py-32 border-t border-var(--border-color) bg-var(--bg-secondary)">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            title="Your data stays yours"
            subtitle="Enterprise-grade security, transparent operations"
            centered
            gradient={false}
            className="mb-16 md:mb-20"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Lock className="w-6 h-6" />}
              title="AES-256-GCM Encryption"
              description="API keys encrypted at rest with authenticated encryption. Salt + IV + auth tag — military-grade security."
              details={["End-to-end encrypted", "At-rest encryption", "Industry standard"]}
            />

            <FeatureCard
              icon={<Key className="w-6 h-6" />}
              title="BYOK — Bring Your Own Keys"
              description="We never see your unencrypted keys. They're decrypted in-memory only during AI calls, then immediately discarded."
              details={["Your API keys", "Your control", "Zero visibility"]}
            />

            <FeatureCard
              icon={<Eye className="w-6 h-6" />}
              title="Zero Tracking"
              description="No analytics trackers. No data selling. No premium upsells. Your automation data belongs to you."
              details={["No trackers", "No data sales", "Open source"]}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════════════════════ */}
      <section className="relative py-20 md:py-32 border-t border-var(--border-color)">
        <div className="aurora-bg" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center z-10">
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-var(--text-primary) tracking-tight mb-6 text-balance">
            Ready to automate
            <br />
            <span className="gradient-text">your LinkedIn?</span>
          </h2>
          <p className="text-lg text-var(--text-secondary) max-w-xl mx-auto leading-relaxed mb-10">
            Join thousands of professionals using LinkedBoost to transform their LinkedIn presence. Free forever.
          </p>
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

      <PremiumFooter />
    </div>
  );
}
