import type { Metadata } from "next";
import { InfoPageLayout } from "@/components/info-page-layout";
import { PremiumCard } from "@/components/premium-card";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "LinkedBoost privacy policy. Learn how we protect your data and respect your privacy.",
  openGraph: {
    title: "Privacy Policy — LinkedBoost",
    description: "Learn how LinkedBoost protects your data and respects your privacy.",
  },
};

const sections = [
  {
    title: "Overview",
    content: `LinkedBoost ("we", "our", "us") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights regarding your data. LinkedBoost is a self-hosted, open-source application. When you self-host LinkedBoost, you control all data storage.`,
  },
  {
    title: "Data We Collect",
    items: [
      {
        label: "Account Information:",
        desc: "Name, email address, and hashed password when you create an account.",
      },
      {
        label: "Resume Data:",
        desc: "Resume content you upload for job application automation.",
      },
      {
        label: "AI API Keys:",
        desc: "Your third-party AI provider API keys, encrypted at rest with AES-256-GCM.",
      },
      {
        label: "Automation Data:",
        desc: "Job applications, posts, scraped leads, and activity logs generated through your use of the platform.",
      },
      {
        label: "Usage Data:",
        desc: "Daily action counts for rate limiting and safety purposes.",
      },
    ],
  },
  {
    title: "How We Use Your Data",
    items: [
      "To provide and operate the LinkedBoost automation platform.",
      "To authenticate your identity and protect your account.",
      "To generate AI-powered content using your own API keys (keys are decrypted in-memory only during API calls).",
      "To track daily usage for anti-detection rate limiting.",
      "To send transactional emails (verification, password reset).",
    ],
  },
  {
    title: "Data We Do NOT Collect",
    items: [
      "We do NOT use analytics trackers or third-party tracking scripts.",
      "We do NOT sell, share, or monetize your data in any way.",
      "We do NOT store your LinkedIn password. The Chrome extension operates on your already-logged-in session.",
      "We do NOT store unencrypted API keys. Keys are encrypted before storage and decrypted only during use.",
    ],
  },
  {
    title: "Data Security",
    content: `We implement industry-standard security measures including AES-256-GCM encryption for API keys, bcrypt password hashing with 12 salt rounds, rate limiting on all API endpoints, CSRF protection, and HTTP-only secure cookies. All database queries use parameterized queries to prevent injection attacks.`,
  },
  {
    title: "Data Retention",
    items: [
      "Activity logs are automatically deleted after 90 days (TTL index).",
      "Notifications are automatically deleted after 30 days.",
      "All other data is retained until you delete your account.",
    ],
  },
  {
    title: "Your Rights",
    items: [
      {
        label: "Data Export:",
        desc: "You can export all your data in JSON format from Settings > Data & Privacy.",
      },
      {
        label: "Account Deletion:",
        desc: "You can permanently delete your account and all associated data at any time.",
      },
      {
        label: "API Key Removal:",
        desc: "You can remove your AI API keys at any time from Settings.",
      },
    ],
  },
  {
    title: "Third-Party Services",
    items: [
      {
        label: "AI Providers:",
        desc: "When you configure AI API keys, your data is sent to the respective provider (Google Gemini, OpenAI, Anthropic, Groq) according to their privacy policies.",
      },
      {
        label: "Email:",
        desc: "We use Resend for transactional emails (verification, password reset only).",
      },
      {
        label: "LinkedIn:",
        desc: "The Chrome extension interacts with LinkedIn on your behalf. LinkedIn's terms of service apply.",
      },
    ],
  },
  {
    title: "Open Source",
    content: `LinkedBoost is open-source software. You can audit every line of code, self-host the application, and control exactly where your data is stored. We encourage transparency and community oversight.`,
  },
  {
    title: "Changes to This Policy",
    content: `We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date at the top of this page. Continued use of LinkedBoost after changes constitutes acceptance of the updated policy.`,
  },
  {
    title: "Contact",
    content: `If you have questions about this privacy policy, please open an issue on our GitHub repository.`,
  },
];

export default function PrivacyPage() {
  return (
    <InfoPageLayout>
      {/* Header Section */}
      <section className="relative pt-32 pb-12 md:pb-16 border-b border-var(--border-color)">
        <div className="aurora-bg opacity-30" />
        <div className="absolute inset-0 dot-grid opacity-20" />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 z-10">
          <h1 className="text-4xl md:text-5xl font-bold text-var(--text-primary) mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-var(--text-tertiary)">
            Last updated: March 2026
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-12">
          {sections.map((section, index) => (
            <PremiumCard
              key={index}
              glassEffect
              className="p-8 space-y-4"
            >
              <h2 className="text-2xl font-bold text-var(--text-primary) flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-var(--accent-cyan) to-var(--accent-magenta) text-var(--text-inverse) text-sm font-bold">
                  {index + 1}
                </span>
                {section.title}
              </h2>

              {section.content && (
                <p className="text-var(--text-secondary) leading-relaxed">
                  {section.content}
                </p>
              )}

              {section.items && Array.isArray(section.items) && (
                <ul className="space-y-3">
                  {section.items.map((item, idx) => {
                    if (typeof item === "string") {
                      return (
                        <li
                          key={idx}
                          className="flex items-start gap-3 text-var(--text-secondary)"
                        >
                          <span className="text-var(--accent-cyan) font-bold mt-0.5">
                            •
                          </span>
                          <span>{item}</span>
                        </li>
                      );
                    } else {
                      return (
                        <li
                          key={idx}
                          className="flex items-start gap-3 text-var(--text-secondary)"
                        >
                          <span className="text-var(--accent-cyan) font-bold mt-0.5">
                            •
                          </span>
                          <div>
                            <strong className="text-var(--text-primary)">
                              {item.label}
                            </strong>
                            {" "}
                            {item.desc}
                          </div>
                        </li>
                      );
                    }
                  })}
                </ul>
              )}
            </PremiumCard>
          ))}
        </div>
      </section>
    </InfoPageLayout>
  );
}
