import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Shield, Lock, EyeOff, Server, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy | WinPilot",
  description: "WinPilot privacy policy. Learn how we protect your data and respect your privacy.",
  openGraph: {
    title: "Privacy Policy — WinPilot",
    description: "Learn how WinPilot protects your data and respects your privacy.",
  },
};

export default function PrivacyPage() {
  const lastUpdated = "June 12, 2026";

  return (
    <div className="min-h-screen bg-[#0A0F1C] text-white selection:bg-[#00E5FF]/30">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00E5FF]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#6366F1]/5 blur-[120px] rounded-full" />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-6xl px-6 pt-4">
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0A0F1C]/80 backdrop-blur-2xl px-6 py-3 shadow-2xl shadow-black/50">
            <Link href="/" className="flex items-center gap-3 group">
               <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00E5FF] to-[#6366F1] shadow-lg shadow-[#00E5FF]/25 transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
                  <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="currentColor" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">WinPilot</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/5 transition-all">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-gradient-to-r from-[#00E5FF] to-[#6366F1] text-white hover:opacity-90 font-semibold border-0 shadow-lg shadow-[#00E5FF]/20">
                  Get Started <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pt-40 pb-16 relative">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00E5FF]/20 bg-[#00E5FF]/5 text-[#00E5FF] text-xs font-medium mb-6">
            <Shield className="w-3.5 h-3.5" />
            <span>Data Protection Commitment</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
            Privacy <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E5FF] to-[#6366F1]">Policy</span>
          </h1>
          <p className="text-white/50 text-lg max-w-2xl mx-auto leading-relaxed">
            We value your trust. This policy outlines how WinPilot handles your data with transparency, security, and integrity.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4 text-sm text-white/30">
            <span>Last updated: {lastUpdated}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>v1.0.1</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-32 relative">
        <div className="mx-auto max-w-3xl px-6">
          <div className="space-y-16">
            
            {/* 1. Introduction */}
            <section className="relative group">
              <div className="absolute -left-8 top-1 hidden md:block text-[#00E5FF]/20 group-hover:text-[#00E5FF]/40 transition-colors">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-[#00E5FF]">01.</span> Introduction
              </h2>
              <p className="text-white/60 leading-relaxed text-lg">
                WinPilot (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) provides a LinkedIn automation platform designed to enhance professional productivity. This Privacy Policy describes our practices regarding the collection, use, and disclosure of information from users of our Chrome Extension and Web Dashboard.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section className="relative group p-8 rounded-3xl border border-white/5 bg-white/[0.02] backdrop-blur-sm">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="text-[#00E5FF]">02.</span> Information We Collect
              </h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#00E5FF] font-semibold">
                    <Lock className="w-4 h-4" />
                    <span>User-Provided Data</span>
                  </div>
                  <ul className="text-sm text-white/50 space-y-2 leading-relaxed list-disc pl-4">
                    <li>Account email and credentials</li>
                    <li>Uploaded resumes and job preferences</li>
                    <li>Encrypted AI API keys (stored via AES-256)</li>
                    <li>Campaign criteria and automation settings</li>
                  </ul>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#6366F1] font-semibold">
                    <Globe className="w-4 h-4" />
                    <span>Automated Interaction</span>
                  </div>
                  <ul className="text-sm text-white/50 space-y-2 leading-relaxed list-disc pl-4">
                    <li>LinkedIn session metadata for automation</li>
                    <li>Job application status and history</li>
                    <li>Extension performance and error logs</li>
                    <li>Usage statistics for safety rate-limiting</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 3. Extension Permissions */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="text-[#00E5FF]">03.</span> Browser Extension Usage
              </h2>
              <p className="text-white/60 mb-6 leading-relaxed">
                The WinPilot Chrome Extension requires specific permissions to automate LinkedIn tasks safely and effectively:
              </p>
              <div className="space-y-4">
                {[
                  { title: "Scripting & Tabs", desc: "To inject automation logic into LinkedIn pages for form filling and navigation." },
                  { title: "Storage", desc: "To securely save your local session preferences and encrypted sync tokens." },
                  { title: "Host Permissions", desc: "To communicate with LinkedIn (automation) and WinPilot.tech (data sync)." },
                  { title: "Alarms", desc: "To manage background connection heartbeats and periodic configuration sync." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 transition-colors hover:border-[#00E5FF]/20">
                    <div className="mt-1 h-2 w-2 rounded-full bg-[#00E5FF] shadow-[0_0_10px_rgba(0,229,255,0.5)]" />
                    <div>
                      <h4 className="font-bold text-white/90 text-sm">{item.title}</h4>
                      <p className="text-xs text-white/40 mt-1">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Data Usage */}
            <section className="relative group">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-[#00E5FF]">04.</span> How We Use Your Data
              </h2>
              <p className="text-white/60 leading-relaxed">
                We use your information strictly to provide our services. This includes generating AI-tailored cover letters using your own API keys, automating networking tasks on your behalf, and maintaining your personal automation history. **We never sell your data to third-party advertisers.**
              </p>
            </section>

            {/* 5. Security First */}
            <section className="p-8 rounded-3xl bg-gradient-to-br from-[#00E5FF]/10 to-[#6366F1]/10 border border-[#00E5FF]/20 relative overflow-hidden">
               <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
                <Lock className="w-40 h-40 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <Lock className="w-6 h-6 text-[#00E5FF]" />
                Security Standards
              </h2>
              <p className="text-white/80 leading-relaxed mb-6">
                Security isn&apos;t a feature; it&apos;s our foundation. We utilize AES-256-GCM encryption for all sensitive keys, secure WebSocket (WSS) for real-time relay, and strict session-based authentication.
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="px-3 py-1 rounded-lg bg-black/30 border border-white/10 text-xs font-mono text-[#00E5FF]">AES-256-GCM</div>
                <div className="px-3 py-1 rounded-lg bg-black/30 border border-white/10 text-xs font-mono text-[#00E5FF]">WSS RELAY</div>
                <div className="px-3 py-1 rounded-lg bg-black/30 border border-white/10 text-xs font-mono text-[#00E5FF]">TLS 1.3</div>
              </div>
            </section>

            {/* 6. Third Parties */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="text-[#00E5FF]">06.</span> Third-Party Disclosure
              </h2>
              <p className="text-white/60 leading-relaxed mb-6">
                WinPilot interacts with third-party services as part of its core functionality:
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                  <h4 className="font-bold mb-2">LinkedIn</h4>
                  <p className="text-xs text-white/40 leading-relaxed">Automation is performed on your local session. LinkedIn&apos;s Terms of Service apply to all automated actions.</p>
                </div>
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                  <h4 className="font-bold mb-2">AI Providers</h4>
                  <p className="text-xs text-white/40 leading-relaxed">When using AI features, data is sent to providers (Google, OpenAI, etc.) using your own configured API keys.</p>
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="pt-8 border-t border-white/5">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-8 rounded-3xl bg-white/[0.02] border border-white/5">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">Questions or concerns?</h3>
                  <p className="text-white/40 text-sm">Our privacy team is here to help you understand your rights.</p>
                </div>
                <a 
                  href="mailto:contact@winpilot.tech" 
                  className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white text-[#0A0F1C] font-bold hover:bg-white/90 transition-all shadow-xl shadow-white/5"
                >
                  contact@winpilot.tech
                </a>
              </div>
            </section>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-20 relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-6">
                 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#6366F1]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    <path d="M13 2L4.5 13H11L10 22L19.5 11H13L13 2Z" fill="white" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="text-lg font-bold text-white tracking-tight">WinPilot</span>
              </Link>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                The ultimate LinkedIn automation engine for professional growth and networking efficiency.
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Platform</h4>
              <ul className="space-y-4 text-sm text-white/40">
                <li><Link href="/features" className="hover:text-[#00E5FF] transition-colors">Features</Link></li>
                <li><Link href="/about" className="hover:text-[#00E5FF] transition-colors">About</Link></li>
                <li><Link href="/dashboard" className="hover:text-[#00E5FF] transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold text-sm mb-6 uppercase tracking-widest">Legal</h4>
              <ul className="space-y-4 text-sm text-white/40">
                <li><Link href="/privacy" className="text-white font-medium">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-[#00E5FF] transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/5 gap-6">
            <p className="text-xs text-white/20">&copy; {new Date().getFullYear()} WinPilot. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <span className="text-[10px] text-white/10 uppercase tracking-[0.2em]">Designed for Performance</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
