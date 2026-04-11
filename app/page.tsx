import { ArrowRight, Code2, Zap, Database, Calendar, Lock, BarChart3, CheckCircle2, Github, X } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-[#222222] bg-[rgba(10,10,10,0.85)] backdrop-blur-[12px] h-14">
        <div className="max-w-[1200px] mx-auto px-10 h-full flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="w-4 h-4 bg-[#00E5FF]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} />
            <span>InPilot</span>
          </div>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Docs', href: '#docs' },
              { label: 'Pricing', href: '#pricing' },
              { label: 'Changelog', href: '#changelog' },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-[#888888] hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-[#888888] hover:text-white transition-colors">
              Sign in
            </a>
            <button className="px-4 py-2 bg-white text-black text-sm font-semibold rounded hover:bg-[#00E5FF] transition-colors">
              Get started free
            </button>
            <button className="p-2 text-[#888888] hover:text-white transition-colors">
              ⌘
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center bg-[#0A0A0A] overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-10 w-full grid grid-cols-2 gap-20 items-center">
          {/* Left Column */}
          <div className="space-y-8">
            {/* Beta Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-2 border border-[#222222] bg-[#111111] rounded" style={{ animation: 'fadeInUp 0.6s ease-out' }}>
              <div className="w-2 h-2 bg-[#00E5FF] rounded-full" style={{ animation: 'pulse 2s infinite' }} />
              <span className="text-xs font-bold tracking-widest text-[#00E5FF] uppercase">Now in Beta</span>
            </div>

            {/* Headline */}
            <div style={{ animation: 'fadeInUp 0.6s ease-out 0.1s both' }}>
              <h1 className="text-[80px] font-black leading-[0.95] tracking-[-0.04em] text-white">
                AUTOMATE<br />
                <span className="text-[#00E5FF]">LINKEDIN.</span><br />
                SHIP FASTER.
              </h1>
            </div>

            {/* Subheadline */}
            <p style={{ animation: 'fadeInUp 0.6s ease-out 0.2s both' }} className="text-lg text-[#888888] max-w-[460px] leading-relaxed">
              InPilot handles job applications, scraping, and posting — so you can focus on building, not clicking.
            </p>

            {/* CTAs */}
            <div style={{ animation: 'fadeInUp 0.6s ease-out 0.3s both' }} className="flex gap-8 pt-4">
              <button className="px-6 py-3 bg-[#00E5FF] text-black font-bold rounded flex items-center gap-2 hover:scale-105 transition-transform">
                Start automating
                <ArrowRight size={16} />
              </button>
              <button className="px-6 py-3 border border-[#333333] text-[#888888] rounded hover:border-white hover:text-white transition-colors">
                View docs
              </button>
            </div>

            {/* Social Proof */}
            <div style={{ animation: 'fadeInUp 0.6s ease-out 0.4s both' }} className="flex items-center gap-3 pt-6">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="w-8 h-8 bg-[#1A1A1A] border border-[#222222] rounded-full flex items-center justify-center text-xs font-bold text-[#888888]">
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <p className="text-sm text-[#555555]">Used by 2,400+ developers</p>
            </div>
          </div>

          {/* Right Column - Terminal */}
          <div style={{ animation: 'fadeInUp 0.6s ease-out 0.4s both' }}>
            <div className="bg-[#0D0D0D] border border-[#222222] rounded-lg shadow-[0_0_60px_rgba(0,229,255,0.06)] overflow-hidden">
              {/* Terminal Header */}
              <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-2 border-b border-[#222222]">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-xs text-[#666666] ml-4 font-mono">inpilot — bash — 80×24</span>
              </div>

              {/* Terminal Body */}
              <div className="p-6 font-mono text-sm leading-relaxed text-[#00E5FF] overflow-hidden">
                <div style={{ animation: 'typeOut 3s steps(100, end) forwards' }}>
                  <div>$ inpilot apply --jobs 50 --filter "remote AND senior"</div>
                  <div className="mt-3 text-white opacity-80"></div>
                  <div>✓ Scraping LinkedIn jobs...     <span className="text-[#555555]">[████████████] 412 found</span></div>
                  <div>✓ Filtering by criteria...      <span className="text-[#555555]">[████████████] 50 matched</span></div>
                  <div>✓ Generating cover letters...   <span className="text-[#555555]">[████████████] 50 done</span></div>
                  <div>→ Submitting applications...    <span className="text-[#555555]">[████████░░░░] 38/50</span></div>
                  <div className="mt-3 text-white">Applied to 38 jobs in 4m 12s.</div>
                  <div className="mt-4">$ inpilot post --schedule "Mon,Wed,Fri 9am" --content ./posts/</div>
                  <div className="mt-1 text-white">✓ Scheduled 12 posts across 3 weeks.</div>
                  <div className="mt-4">$ <span style={{ animation: 'blink 1s infinite' }}>_</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos Bar */}
      <section className="border-y border-[#1A1A1A] bg-[#111111] py-6">
        <div className="max-w-[1200px] mx-auto px-10">
          <p className="text-xs text-[#444444] tracking-widest uppercase mb-8">Trusted by engineers at</p>
          <div className="flex items-center gap-12 overflow-hidden">
            {['GitHub', 'Stripe', 'Vercel', 'Linear', 'Raycast', 'Supabase'].map((company) => (
              <div key={company} className="text-[#333333] font-bold text-sm hover:text-[#888888] transition-colors whitespace-nowrap">
                {company}
              </div>
            ))}
            {['GitHub', 'Stripe', 'Vercel', 'Linear', 'Raycast', 'Supabase'].map((company) => (
              <div key={`${company}-dup`} className="text-[#333333] font-bold text-sm hover:text-[#888888] transition-colors whitespace-nowrap">
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section id="features" className="bg-[#0A0A0A] py-32 border-b border-[#1A1A1A]">
        <div className="max-w-[1200px] mx-auto px-10">
          <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-6">Capabilities</div>
          <h2 className="text-5xl font-bold mb-4">Everything LinkedIn. Automated.</h2>
          <p className="text-lg text-[#888888] mb-16 max-w-2xl">One SDK. Full control over your LinkedIn presence.</p>

          {/* Bento Grid */}
          <div className="grid grid-cols-3 gap-6 auto-rows-[320px]">
            {/* Card 1 - Wide */}
            <div className="col-span-2 bg-[#111111] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] hover:bg-[#131313] transition-all group cursor-pointer">
              <Zap className="w-6 h-6 text-[#00E5FF] mb-4" />
              <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-3">Job Engine</div>
              <h3 className="text-xl font-bold mb-4">Job Application Engine</h3>
              <p className="text-sm text-[#666666] mb-6">Apply to 100+ jobs per day. AI-matched filters, auto-filled forms, personalized cover letters.</p>
              <div className="text-xs font-mono text-[#00E5FF] bg-[#0D0D0D] px-3 py-2 rounded inline-block">inpilot apply --limit 100 --match-score 0.8</div>
            </div>

            {/* Card 2 */}
            <div className="bg-[#111111] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] hover:bg-[#131313] transition-all group cursor-pointer">
              <Database className="w-6 h-6 text-[#00E5FF] mb-4" />
              <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-3">Scraper</div>
              <h3 className="text-xl font-bold mb-4">LinkedIn Scraper</h3>
              <p className="text-sm text-[#666666]">Extract profiles, emails, company data. Export to JSON, CSV, or pipe directly into your workflow.</p>
            </div>

            {/* Card 3 */}
            <div className="bg-[#111111] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] hover:bg-[#131313] transition-all group cursor-pointer">
              <Calendar className="w-6 h-6 text-[#00E5FF] mb-4" />
              <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-3">Scheduling</div>
              <h3 className="text-xl font-bold mb-4">Post Scheduler</h3>
              <p className="text-sm text-[#666666]">Schedule posts with a cron-like syntax. Supports carousels, polls, and text posts.</p>
            </div>

            {/* Card 4 - Wide */}
            <div className="col-span-2 bg-[#111111] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] hover:bg-[#131313] transition-all group cursor-pointer">
              <Code2 className="w-6 h-6 text-[#00E5FF] mb-4" />
              <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-3">API</div>
              <h3 className="text-xl font-bold mb-4">API & Webhooks</h3>
              <p className="text-sm text-[#666666] mb-6">REST API + webhooks. Integrate into your stack in minutes. Full OpenAPI spec included.</p>
              <div className="flex gap-3">
                <span className="text-xs font-mono bg-[#0D0D0D] px-2 py-1 rounded text-[#00E5FF]">POST /v1/apply</span>
                <span className="text-xs font-mono bg-[#0D0D0D] px-2 py-1 rounded text-[#00E5FF]">GET /v1/scrape</span>
              </div>
            </div>

            {/* Card 5 - Full Width */}
            <div className="col-span-3 bg-[#111111] border border-[#1A1A1A] rounded-lg p-8 hover:border-[#333333] hover:bg-[#131313] transition-all group cursor-pointer">
              <BarChart3 className="w-6 h-6 text-[#00E5FF] mb-4" />
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-3">Analytics</div>
                  <h3 className="text-xl font-bold mb-4">Analytics Dashboard</h3>
                  <p className="text-sm text-[#666666] mb-6 max-w-2xl">Track application success rates, profile view spikes, post engagement, and scraping quotas in real time.</p>
                </div>
                <div className="flex items-end gap-2 h-16">
                  {[20, 45, 30, 60, 40, 50, 35].map((height, i) => (
                    <div key={i} className="w-2 bg-[#00E5FF]" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-[#111111] py-32 border-b border-[#1A1A1A]">
        <div className="max-w-[1200px] mx-auto px-10">
          <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-6">Quickstart</div>
          <h2 className="text-5xl font-bold mb-16">Up and running in 3 minutes.</h2>

          <div className="grid grid-cols-3 gap-8 relative">
            {/* Connector Line */}
            <div className="absolute top-20 left-0 right-0 h-0.5 bg-[#222222]" style={{ width: 'calc(100% - 60px)', left: '30px' }} />

            {[
              { num: '01', title: 'Install', code: 'npm install -g inpilot' },
              { num: '02', title: 'Authenticate', code: 'inpilot auth --token YOUR_LINKEDIN_TOKEN' },
              { num: '03', title: 'Automate', code: 'inpilot apply --jobs 50 --auto' },
            ].map((step, i) => (
              <div key={i} className="relative">
                <div className="text-[96px] font-black text-[#1A1A1A] absolute -top-12 left-0 leading-none">{step.num}</div>
                <div className="relative z-10 pt-8">
                  <div className="w-12 h-12 bg-[#00E5FF] rounded-lg flex items-center justify-center mb-6 text-black font-bold">
                    {i + 1}
                  </div>
                  <h3 className="text-xl font-bold mb-4">{step.title}</h3>
                  <div className="bg-[#0A0A0A] border border-[#222222] rounded px-4 py-3 font-mono text-sm text-[#00E5FF] overflow-x-auto">
                    {step.code}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <button className="px-6 py-3 border border-[#333333] text-[#888888] rounded hover:border-[#00E5FF] hover:text-[#00E5FF] transition-colors flex items-center gap-2 mx-auto">
              Read the full docs
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#0A0A0A] py-32 border-b border-[#1A1A1A]">
        <div className="max-w-[1200px] mx-auto px-10">
          <h2 className="text-5xl font-bold mb-4">Simple, usage-based pricing.</h2>
          <p className="text-lg text-[#888888] mb-16">Pay for what you automate. No seat fees.</p>

          <div className="grid grid-cols-3 gap-8">
            {[
              { name: 'Hobby', price: '$0', features: ['50 job apps/mo', '500 scrapes/mo', '5 scheduled posts'], cta: 'Start free' },
              { name: 'Pro', price: '$29', features: ['2,000 apps/mo', '50,000 scrapes', 'Unlimited posts', 'API access'], cta: 'Get Pro →', featured: true },
              { name: 'Team', price: '$99', features: ['Unlimited everything', 'Team seats', 'Priority support', 'SLA'], cta: 'Contact us' },
            ].map((plan, i) => (
              <div
                key={i}
                className={`p-8 rounded-lg border transition-all ${
                  plan.featured
                    ? 'bg-[#111111] border-[#00E5FF] shadow-[0_0_40px_rgba(0,229,255,0.08)] scale-105'
                    : 'bg-[#111111] border-[#1A1A1A] hover:border-[#333333]'
                }`}
              >
                {plan.featured && (
                  <div className="inline-block px-3 py-1 bg-[#00E5FF] text-black text-xs font-bold rounded-full mb-4">
                    RECOMMENDED
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="text-4xl font-bold mb-6">{plan.price}<span className="text-lg text-[#888888]">/month</span></div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-3 text-[#888888]">
                      <CheckCircle2 size={16} className="text-[#00E5FF] flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded font-semibold transition-colors ${
                    plan.featured
                      ? 'bg-[#00E5FF] text-black hover:bg-white'
                      : 'border border-[#333333] text-[#888888] hover:border-[#00E5FF] hover:text-[#00E5FF]'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-[#111111] py-32 border-b border-[#1A1A1A]">
        <div className="max-w-[1200px] mx-auto px-10">
          <h2 className="text-4xl font-bold mb-16">What developers say.</h2>

          <div className="grid grid-cols-3 gap-6">
            {[
              { quote: "Finally stopped manually applying. InPilot handles 100 apps while I sleep.", author: "@jsdevmike", role: "Senior Eng at Stripe" },
              { quote: "The scraper API is insane. I piped LinkedIn data straight into my CRM in an afternoon.", author: "@buildwithpriya", role: "Indie hacker" },
              { quote: "Scheduled 3 months of LinkedIn content in one afternoon. Game changer.", author: "@aaronxyz_", role: "DevRel at Vercel" },
              { quote: "Saved me 20 hours a week. Now I focus on actual networking instead of sending applications.", author: "@devjoshua", role: "Senior Developer" },
              { quote: "The API documentation is so clean. Integrated it into our hiring tool in 2 hours.", author: "@alextech", role: "Founder, TechHire" },
              { quote: "Best developer tool I've invested in. ROI is insane.", author: "@gracedev", role: "CTO at StartupX" },
            ].map((testimonial, i) => (
              <div key={i} className="bg-[#0A0A0A] border border-[#1A1A1A] rounded-lg p-6">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span key={star} className="text-[#00E5FF]">★</span>
                  ))}
                </div>
                <blockquote className="text-[#888888] leading-relaxed mb-4">"{testimonial.quote}"</blockquote>
                <div>
                  <div className="font-bold text-white">{testimonial.author}</div>
                  <div className="text-xs text-[#555555]">{testimonial.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#0A0A0A] py-32 border-b border-[#1A1A1A] relative overflow-hidden">
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="max-w-[1200px] mx-auto px-10 text-center relative z-10">
          <div className="text-xs text-[#00E5FF] font-bold tracking-widest uppercase mb-6">Start today</div>
          <h2 className="text-6xl font-black mb-6">Stop clicking. Start automating.</h2>
          <p className="text-lg text-[#888888] mb-12">Join 2,400+ developers using InPilot to run LinkedIn on autopilot.</p>

          <div className="flex gap-6 justify-center mb-8">
            <button className="px-8 py-4 bg-[#00E5FF] text-black font-bold rounded flex items-center gap-2 hover:scale-105 transition-transform">
              Get started free
              <ArrowRight size={18} />
            </button>
            <button className="px-8 py-4 border border-[#333333] text-[#888888] rounded hover:border-[#00E5FF] hover:text-[#00E5FF] transition-colors">
              Talk to a founder
            </button>
          </div>

          <p className="text-sm text-[#444444]">No credit card required · Cancel anytime · Open API</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0A0A0A] border-t border-[#1A1A1A] py-16">
        <div className="max-w-[1200px] mx-auto px-10">
          <div className="grid grid-cols-4 gap-12 mb-12">
            {/* Col 1 */}
            <div>
              <div className="flex items-center gap-2 font-bold text-lg mb-4">
                <div className="w-4 h-4 bg-[#00E5FF]" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} />
                <span>InPilot</span>
              </div>
              <p className="text-sm text-[#444444] mb-4">LinkedIn, automated.</p>
              <div className="flex gap-4">
                <a href="#" className="text-[#444444] hover:text-[#888888] transition-colors">
                  <Github size={18} />
                </a>
                <a href="#" className="text-[#444444] hover:text-[#888888] transition-colors">
                  <X size={18} />
                </a>
              </div>
            </div>

            {/* Col 2 */}
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Product</h4>
              <ul className="space-y-2 text-sm">
                {['Features', 'Pricing', 'Changelog', 'Roadmap'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#444444] hover:text-[#888888] transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 */}
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Developers</h4>
              <ul className="space-y-2 text-sm">
                {['Docs', 'API Reference', 'SDKs', 'Status'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#444444] hover:text-[#888888] transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4 */}
            <div>
              <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-widest">Company</h4>
              <ul className="space-y-2 text-sm">
                {['About', 'Blog', 'Careers', 'Privacy'].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-[#444444] hover:text-[#888888] transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-[#1A1A1A] pt-12 flex justify-between text-sm text-[#444444]">
            <p>© 2025 InPilot. Built for developers, by developers.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[#888888] transition-colors">Terms</a>
              <a href="#" className="hover:text-[#888888] transition-colors">Privacy</a>
              <a href="#" className="hover:text-[#888888] transition-colors">Status</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Animations */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes typeOut {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }

        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
