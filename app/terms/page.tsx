import type { Metadata } from "next";
import Link from "next/link";
import { Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Winpilot terms of service. Understand the rules and guidelines for using our platform.",
  openGraph: {
    title: "Terms of Service — Winpilot",
    description: "Understand the rules and guidelines for using Winpilot.",
  },
};

export default function TermsPage() {
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
          <h1 className="text-4xl font-bold text-white tracking-tight mb-4">Terms of Service</h1>
          <p className="text-white/30 text-sm mb-12">Last updated: March 2026</p>

          <div className="prose prose-invert max-w-none space-y-8">
            <div>
              <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
              <p className="text-white/40 leading-relaxed">
                By using Winpilot (&quot;the Service&quot;), you agree to these Terms of Service. If you do not agree,
                do not use the Service. Winpilot is free, open-source software provided as-is.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot is a LinkedIn automation platform that enables automated job applications,
                content creation, and lead scraping through a web dashboard and Chrome extension.
                The Service uses AI providers through your own API keys (BYOK model).
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">3. User Responsibilities</h2>
              <ul className="text-white/40 leading-relaxed space-y-2">
                <li>You are responsible for your LinkedIn account and any actions taken by Winpilot on your behalf.</li>
                <li>You must comply with LinkedIn&apos;s Terms of Service and User Agreement.</li>
                <li>You are responsible for the security of your account credentials and AI API keys.</li>
                <li>You must not use Winpilot for spam, harassment, or any illegal purpose.</li>
                <li>You acknowledge that LinkedIn automation carries inherent risks, including potential account restrictions.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">4. BYOK (Bring Your Own Key)</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot requires you to provide your own AI API keys from third-party providers
                (Google Gemini, OpenAI, Anthropic, Groq). You are responsible for:
              </p>
              <ul className="text-white/40 leading-relaxed space-y-2 mt-2">
                <li>Complying with the respective AI provider&apos;s terms of service and usage policies.</li>
                <li>Any costs incurred from API usage with your keys.</li>
                <li>Maintaining valid and active API keys.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">5. Anti-Detection & Safety</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot includes anti-detection features designed to minimize the risk of LinkedIn account restrictions.
                However, we cannot guarantee that your account will not be affected. You use the Service at your own risk.
                We recommend using conservative settings and monitoring your account regularly.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">6. Limitation of Liability</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot is provided &quot;as is&quot; without warranty of any kind, express or implied. We are not liable for:
              </p>
              <ul className="text-white/40 leading-relaxed space-y-2 mt-2">
                <li>Any LinkedIn account restrictions, suspensions, or bans.</li>
                <li>Loss of data, opportunities, or revenue.</li>
                <li>Service interruptions or technical failures.</li>
                <li>Actions of third-party AI providers.</li>
                <li>Any indirect, incidental, or consequential damages.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">7. Intellectual Property</h2>
              <p className="text-white/40 leading-relaxed">
                Winpilot is open-source software. You retain ownership of all content you create,
                upload, or generate through the Service, including resumes, posts, and outreach messages.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">8. Account Termination</h2>
              <p className="text-white/40 leading-relaxed">
                You may delete your account at any time from Settings &gt; Data &amp; Privacy. Upon deletion,
                all your data is permanently removed from our systems, including encrypted API keys,
                resumes, applications, and activity logs.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">9. Modifications</h2>
              <p className="text-white/40 leading-relaxed">
                We reserve the right to modify these terms at any time. Changes will be reflected in
                the &quot;Last updated&quot; date. Continued use after modifications constitutes acceptance
                of the updated terms.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">10. Governing Law</h2>
              <p className="text-white/40 leading-relaxed">
                These terms shall be governed by and construed in accordance with applicable laws.
                Any disputes shall be resolved through good-faith discussion and, if necessary,
                binding arbitration.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white mb-3">Contact</h2>
              <p className="text-white/40 leading-relaxed">
                For questions about these terms, please open an issue on our GitHub repository.
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
