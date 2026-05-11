import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Winpilot privacy policy. Learn how we protect your data and respect your privacy.",
  openGraph: {
    title: "Privacy Policy — Winpilot",
    description: "Learn how Winpilot protects your data and respects your privacy.",
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0A0F1C]">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-6xl px-6 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0A0F1C]/80 backdrop-blur-2xl px-6 py-3">
            <Link href="/" className="flex items-center gap-3">
               <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#6366F1] shadow-lg shadow-[#00E5FF]/25">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">Winpilot</span>
            </Link>
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

      {/* Content */}
      <section className="pt-32 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold text-white tracking-tight mb-4">Privacy Policy</h1>
          <p className="text-white/30 text-sm mb-12">Last updated: March 2026</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This policy explains
                what data we collect, how we use it, and your rights regarding your data. Winpilot is a
                self-hosted, open-source application. When you self-host Winpilot, you control all data storage.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">2. Data We Collect</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li><strong className="text-white/60">Account Information:</strong> Name, email address, and hashed password when you create an account.</li>
                <li><strong className="text-white/60">Resume Data:</strong> Resume content you upload for job application automation.</li>
                <li><strong className="text-white/60">AI API Keys:</strong> Your third-party AI provider API keys, encrypted at rest with AES-256-GCM.</li>
                <li><strong className="text-white/60">Automation Data:</strong> Job applications, posts, scraped leads, and activity logs generated through your use of the platform.</li>
                <li><strong className="text-white/60">Usage Data:</strong> Daily action counts for rate limiting and safety purposes.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">3. How We Use Your Data</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li>To provide and operate the Winpilot automation platform.</li>
                <li>To authenticate your identity and protect your account.</li>
                <li>To generate AI-powered content using your own API keys (keys are decrypted in-memory only during API calls).</li>
                <li>To track daily usage for anti-detection rate limiting.</li>
                <li>To send transactional emails (verification, password reset).</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">4. Data We Do NOT Collect</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li>We do NOT use analytics trackers or third-party tracking scripts.</li>
                <li>We do NOT sell, share, or monetize your data in any way.</li>
                <li>We do NOT store your LinkedIn password. The Chrome extension operates on your already-logged-in session.</li>
                <li>We do NOT store unencrypted API keys. Keys are encrypted before storage and decrypted only during use.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">5. Data Security</h2>
              <p className="text-white/40 leading-relaxed">
                We implement industry-standard security measures including AES-256-GCM encryption for API keys,
                bcrypt password hashing with 12 salt rounds, rate limiting on all API endpoints, CSRF protection,
                and HTTP-only secure cookies. All database queries use parameterized queries to prevent injection attacks.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li>Activity logs are automatically deleted after 90 days (TTL index).</li>
                <li>Notifications are automatically deleted after 30 days.</li>
                <li>All other data is retained until you delete your account.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li><strong className="text-white/60">Data Export:</strong> You can export all your data in JSON format from Settings &gt; Data &amp; Privacy.</li>
                <li><strong className="text-white/60">Account Deletion:</strong> You can permanently delete your account and all associated data at any time.</li>
                <li><strong className="text-white/60">API Key Removal:</strong> You can remove your AI API keys at any time from Settings.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">8. Third-Party Services</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li><strong className="text-white/60">AI Providers:</strong> When you configure AI API keys, your data is sent to the respective provider (Google Gemini, OpenAI, Anthropic, Groq) according to their privacy policies.</li>
                <li><strong className="text-white/60">Email:</strong> We use Resend for transactional emails (verification, password reset only).</li>
                <li><strong className="text-white/60">LinkedIn:</strong> The Chrome extension interacts with LinkedIn on your behalf. LinkedIn&apos;s terms of service apply.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">9. Open Source</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot is open-source software. You can audit every line of code, self-host the application,
                and control exactly where your data is stored. We encourage transparency and community oversight.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">10. Changes to This Policy</h2>
              <p className="text-white/40 leading-relaxed">
                We may update this privacy policy from time to time. Changes will be reflected in the
                &quot;Last updated&quot; date at the top of this page. Continued use of Winpilot after changes
                constitutes acceptance of the updated policy.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
              <p className="text-white/40 leading-relaxed">
                If you have questions about this privacy policy, please open an issue on our GitHub repository.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#6366F1]">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
                </svg>
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
