"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type IconProps = {
  className?: string;
};

type Capability = {
  label: string;
  title: string;
  body: string;
  icon: (props: IconProps) => React.JSX.Element;
  snippet?: string;
  chips?: string[];
  wide?: boolean;
  full?: boolean;
  chart?: boolean;
};

const NAV_LINKS = [
  { label: "Features", href: "#capabilities" },
  { label: "Docs", href: "#quickstart" },
  { label: "Pricing", href: "#pricing" },
  { label: "Changelog", href: "#footer" },
];

const TRUSTED_COMPANIES = ["GitHub", "Stripe", "Vercel", "Linear", "Raycast", "Supabase"];

const CAPABILITIES: Capability[] = [
  {
    label: "AUTOMATION",
    title: "Job Application Engine",
    body: "Apply to 100+ jobs per day. AI-matched filters, auto-filled forms, personalized cover letters.",
    icon: CursorIcon,
    snippet: "inpilot apply --limit 100 --match-score 0.8",
    wide: true,
  },
  {
    label: "SCRAPING",
    title: "LinkedIn Scraper",
    body: "Extract profiles, emails, company data. Export to JSON, CSV, or pipe directly into your workflow.",
    icon: SearchIcon,
  },
  {
    label: "CONTENT",
    title: "Post Scheduler",
    body: "Schedule posts with a cron-like syntax. Supports carousels, polls, and text posts.",
    icon: CalendarIcon,
  },
  {
    label: "INTEGRATION",
    title: "API & Webhooks",
    body: "REST API + webhooks. Integrate into your stack in minutes. Full OpenAPI spec included.",
    icon: PlugIcon,
    chips: ["POST /v1/apply", "GET /v1/scrape"],
    wide: true,
  },
  {
    label: "INSIGHTS",
    title: "Analytics Dashboard",
    body: "Track application success rates, profile view spikes, post engagement, and scraping quotas in real time.",
    icon: ChartIcon,
    full: true,
    chart: true,
  },
];

const QUICKSTART_STEPS = [
  {
    number: "01",
    title: "Install",
    body: "Install the CLI globally and get immediate access to automation commands.",
    command: "npm install -g inpilot",
    icon: InstallIcon,
  },
  {
    number: "02",
    title: "Authenticate",
    body: "Connect your account once and keep automation secured behind your token.",
    command: "inpilot auth --token YOUR_LINKEDIN_TOKEN",
    icon: AuthIcon,
  },
  {
    number: "03",
    title: "Automate",
    body: "Launch automated applications and let InPilot execute the repetitive workflow.",
    command: "inpilot apply --jobs 50 --auto",
    icon: BoltIcon,
  },
];

const PRICING_PLANS = [
  {
    name: "Hobby",
    price: "$0",
    cadence: "/ month",
    features: ["50 job apps/mo", "500 scrapes/mo", "5 scheduled posts"],
    cta: "Start free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "/ month",
    features: ["2,000 apps/mo", "50,000 scrapes", "Unlimited posts", "API access"],
    cta: "Get Pro →",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$99",
    cadence: "/ month",
    features: ["Unlimited everything", "Team seats", "Priority support", "SLA"],
    cta: "Contact us",
    highlighted: false,
  },
];

const TESTIMONIALS = [
  {
    quote: "Finally stopped manually applying. InPilot handles 100 apps while I sleep.",
    author: "@jsdevmike",
    role: "Senior Eng at Stripe",
    initials: "JM",
  },
  {
    quote: "The scraper API is insane. I piped LinkedIn data straight into my CRM in an afternoon.",
    author: "@buildwithpriya",
    role: "Indie hacker",
    initials: "BP",
  },
  {
    quote: "Scheduled 3 months of LinkedIn content in one afternoon. Game changer.",
    author: "@aaronxyz_",
    role: "DevRel at Vercel",
    initials: "AX",
  },
  {
    quote: "Our growth team replaced manual prospecting with scheduled scrapes and webhooks in two days.",
    author: "@nadiadev",
    role: "Growth Engineer",
    initials: "ND",
  },
  {
    quote: "I plugged InPilot into my internal tooling and now LinkedIn outreach is just another cron job.",
    author: "@opswithleo",
    role: "Platform Engineer",
    initials: "OL",
  },
  {
    quote: "The command-first workflow feels built for devs. No dashboard maze, just automation that works.",
    author: "@samcodesfast",
    role: "Technical Founder",
    initials: "SC",
  },
];

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Changelog", "Roadmap"],
  },
  {
    title: "Developers",
    links: ["Docs", "API Reference", "SDKs", "Status"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Privacy"],
  },
];

const PALETTE_COMMANDS = [
  { label: "Jump to Features", hint: "#capabilities", href: "#capabilities" },
  { label: "Open Quickstart", hint: "#quickstart", href: "#quickstart" },
  { label: "View Pricing", hint: "#pricing", href: "#pricing" },
  { label: "Start Free", hint: "/register", href: "/register" },
];

const AVATARS = ["RK", "AL", "SM", "TP", "DN"];

const CHART_BARS = [48, 72, 58, 84, 66, 92, 74];

function renderBar(filledBlocks: number): string {
  const boundedBlocks = Math.max(0, Math.min(12, filledBlocks));
  return `${"█".repeat(boundedBlocks)}${"░".repeat(12 - boundedBlocks)}`;
}

function buildTerminalText(progress: number[]): string {
  return `$ inpilot apply --jobs 50 --filter "remote AND senior"

✓ Scraping LinkedIn jobs...     [${renderBar(progress[0])}] 412 found
✓ Filtering by criteria...      [${renderBar(progress[1])}] 50 matched
✓ Generating cover letters...   [${renderBar(progress[2])}] 50 done
→ Submitting applications...    [${renderBar(progress[3])}] 38/50

Applied to 38 jobs in 4m 12s.

$ inpilot post --schedule "Mon,Wed,Fri 9am" --content ./posts/
✓ Scheduled 12 posts across 3 weeks.

$ `;
}

export default function Home() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [typingDone, setTypingDone] = useState(false);
  const [progressBars, setProgressBars] = useState<number[]>([0, 0, 0, 0]);
  const [visibleCards, setVisibleCards] = useState<Record<number, boolean>>({});

  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previousScrollY = useRef(0);

  const initialTerminalText = useMemo(() => buildTerminalText([0, 0, 0, 0]), []);

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY > previousScrollY.current + 10 && currentScrollY > 90) {
        setNavHidden(true);
      } else if (currentScrollY < previousScrollY.current - 10) {
        setNavHidden(false);
      }

      previousScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCommandPaletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isCommandPaletteShortcut) {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const terminal = buildTerminalText([0, 0, 0, 0]);
    const typingInterval = window.setInterval(() => {
      setTypedLength((currentLength) => {
        const nextLength = Math.min(currentLength + 1, terminal.length);

        if (nextLength >= terminal.length) {
          window.clearInterval(typingInterval);
          setTypingDone(true);
        }

        return nextLength;
      });
    }, 12);

    return () => window.clearInterval(typingInterval);
  }, []);

  useEffect(() => {
    if (!typingDone) {
      return;
    }

    const targetBars = [12, 12, 12, 8];
    const duration = 1500;
    let animationFrameId = 0;
    const start = performance.now();

    const animateBars = (currentTime: number) => {
      const progress = Math.min(1, (currentTime - start) / duration);
      const nextBars = targetBars.map((target) => Math.round(target * progress));
      setProgressBars(nextBars);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(animateBars);
      }
    };

    animationFrameId = window.requestAnimationFrame(animateBars);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [typingDone]);

  useEffect(() => {
    const timeoutIds: number[] = [];

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const target = entry.target as HTMLDivElement;
          const cardIndex = Number(target.dataset.cardIndex ?? "0");
          const timeoutId = window.setTimeout(() => {
            setVisibleCards((current) => ({ ...current, [cardIndex]: true }));
          }, cardIndex * 80);

          timeoutIds.push(timeoutId);
          observer.unobserve(target);
        });
      },
      { threshold: 0.25 },
    );

    cardRefs.current.forEach((card) => {
      if (card) {
        observer.observe(card);
      }
    });

    return () => {
      observer.disconnect();
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    if (mobileMenuOpen || paletteOpen) {
      document.body.style.overflow = "hidden";
      return;
    }

    document.body.style.overflow = "";
  }, [mobileMenuOpen, paletteOpen]);

  const typedText = typingDone ? buildTerminalText(progressBars) : initialTerminalText.slice(0, typedLength);

  const handleCommandClick = (href: string) => {
    setPaletteOpen(false);
    setMobileMenuOpen(false);

    if (href.startsWith("#")) {
      const section = document.querySelector(href);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    router.push(href);
  };

  return (
    <div className={styles.page}>
      <nav className={`${styles.navbar} ${navHidden ? styles.navbarHidden : ""}`}>
        <div className={styles.container}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoSquare} aria-hidden="true">
                ■
              </span>
              <span className={styles.logoWordmark}>InPilot</span>
            </Link>

            <div className={styles.navLinks}>
              {NAV_LINKS.map((link) => (
                <a key={link.label} href={link.href} className={styles.navLink}>
                  {link.label}
                </a>
              ))}
            </div>

            <div className={styles.navActions}>
              <Link href="/login" className={styles.signInLink}>
                Sign in
              </Link>
              <Link href="/register" className={styles.navPrimaryCta}>
                Get started free
              </Link>
              <button
                type="button"
                className={styles.commandButton}
                aria-label="Open command palette"
                onClick={() => setPaletteOpen(true)}
              >
                ⌘
              </button>
              <button
                type="button"
                className={styles.mobileMenuButton}
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>
            </div>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div className={styles.mobileMenuOverlay}>
          <div className={styles.mobileMenuHeader}>
            <span className={styles.mobileMenuBrand}>■ InPilot</span>
            <button
              type="button"
              className={styles.mobileCloseButton}
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          <div className={styles.mobileMenuLinks}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className={styles.mobileMenuLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className={styles.mobileMenuActions}>
            <Link href="/login" className={styles.mobileSecondaryCta} onClick={() => setMobileMenuOpen(false)}>
              Sign in
            </Link>
            <Link href="/register" className={styles.mobilePrimaryCta} onClick={() => setMobileMenuOpen(false)}>
              Get started free
            </Link>
          </div>
        </div>
      )}

      {paletteOpen && (
        <div className={styles.paletteOverlay} onClick={() => setPaletteOpen(false)}>
          <div
            className={styles.paletteDialog}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className={styles.paletteHeader}>⌘ Command Palette</div>
            <input className={styles.paletteInput} readOnly value="Type a command..." aria-label="Command input" />
            <div className={styles.paletteCommandList}>
              {PALETTE_COMMANDS.map((command) => (
                <button
                  key={command.label}
                  type="button"
                  className={styles.paletteCommand}
                  onClick={() => handleCommandClick(command.href)}
                >
                  <span>{command.label}</span>
                  <span className={styles.paletteHint}>{command.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main>
        <section className={styles.heroSection}>
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <div className={styles.betaBadge}>
                  <span className={styles.betaDot} aria-hidden="true" />
                  <span>■ NOW IN BETA</span>
                </div>

                <h1 className={styles.heroHeadline}>
                  <span className={`${styles.heroLine} ${styles.heroLineOne}`}>AUTOMATE</span>
                  <span className={`${styles.heroLine} ${styles.heroLineTwo}`}>LINKEDIN.</span>
                  <span className={`${styles.heroLine} ${styles.heroLineThree}`}>SHIP FASTER.</span>
                </h1>

                <p className={styles.heroSubheadline}>
                  InPilot handles job applications, scraping, and posting so you can focus on building, not clicking.
                </p>

                <div className={styles.heroCtas}>
                  <Link href="/register" className={`${styles.ctaButton} ${styles.ctaPrimary}`}>
                    Start automating →
                  </Link>
                  <a href="#quickstart" className={`${styles.ctaButton} ${styles.ctaGhost}`}>
                    View docs
                  </a>
                </div>

                <div className={styles.socialProof}>
                  <div className={styles.avatarStack}>
                    {AVATARS.map((initials) => (
                      <span key={initials} className={styles.avatarBubble}>
                        {initials}
                      </span>
                    ))}
                  </div>
                  <span className={styles.socialProofText}>Used by 2,400+ developers</span>
                </div>
              </div>

              <div className={styles.heroVisual}>
                <div className={styles.terminalCard}>
                  <div className={styles.terminalChrome}>
                    <div className={styles.chromeDots}>
                      <span className={styles.dotRed} />
                      <span className={styles.dotYellow} />
                      <span className={styles.dotGreen} />
                    </div>
                    <span className={styles.terminalTitle}>inpilot — bash — 80×24</span>
                  </div>

                  <div className={styles.terminalBody}>
                    {!typingDone && (
                      <pre className={styles.terminalTypingText}>
                        {typedText}
                        <span className={styles.cursor}>_</span>
                      </pre>
                    )}

                    {typingDone && (
                      <div className={styles.terminalRendered}>
                        <div className={styles.terminalCommandLine}>{'$ inpilot apply --jobs 50 --filter "remote AND senior"'}</div>
                        <div className={styles.terminalSpacer} />

                        <div className={styles.terminalProgressLine}>
                          <span className={styles.terminalSymbol}>✓</span>
                          <span className={styles.terminalLabel}>Scraping LinkedIn jobs...</span>
                          <span className={styles.terminalBar}>[{renderBar(progressBars[0])}]</span>
                          <span className={styles.terminalMeta}>412 found</span>
                        </div>

                        <div className={styles.terminalProgressLine}>
                          <span className={styles.terminalSymbol}>✓</span>
                          <span className={styles.terminalLabel}>Filtering by criteria...</span>
                          <span className={styles.terminalBar}>[{renderBar(progressBars[1])}]</span>
                          <span className={styles.terminalMeta}>50 matched</span>
                        </div>

                        <div className={styles.terminalProgressLine}>
                          <span className={styles.terminalSymbol}>✓</span>
                          <span className={styles.terminalLabel}>Generating cover letters...</span>
                          <span className={styles.terminalBar}>[{renderBar(progressBars[2])}]</span>
                          <span className={styles.terminalMeta}>50 done</span>
                        </div>

                        <div className={styles.terminalProgressLine}>
                          <span className={styles.terminalArrow}>→</span>
                          <span className={styles.terminalLabel}>Submitting applications...</span>
                          <span className={styles.terminalBar}>[{renderBar(progressBars[3])}]</span>
                          <span className={styles.terminalMeta}>38/50</span>
                        </div>

                        <div className={styles.terminalSpacer} />
                        <div className={styles.terminalSummary}>Applied to 38 jobs in 4m 12s.</div>
                        <div className={styles.terminalSpacer} />
                        <div className={styles.terminalCommandLine}>{'$ inpilot post --schedule "Mon,Wed,Fri 9am" --content ./posts/'}</div>
                        <div className={styles.terminalProgressLine}>
                          <span className={styles.terminalSymbol}>✓</span>
                          <span className={styles.terminalLabel}>Scheduled 12 posts across 3 weeks.</span>
                        </div>
                        <div className={styles.terminalSpacer} />
                        <div className={styles.terminalPrompt}>
                          $ <span className={styles.cursor}>_</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.trustedStrip}>
          <div className={styles.container}>
            <p className={styles.trustedLabel}>TRUSTED BY ENGINEERS AT</p>
            <div className={styles.marqueeMask}>
              <div className={styles.marqueeTrack}>
                {[...TRUSTED_COMPANIES, ...TRUSTED_COMPANIES].map((company, index) => (
                  <span key={`${company}-${index}`} className={styles.companyWordmark}>
                    {company}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className={styles.featuresSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>CAPABILITIES</p>
              <h2 className={styles.sectionTitle}>Everything LinkedIn. Automated.</h2>
              <p className={styles.sectionSubtitle}>One SDK. Full control over your LinkedIn presence.</p>
            </div>

            <div className={styles.bentoGrid}>
              {CAPABILITIES.map((card, index) => (
                <div
                  key={card.title}
                  ref={(node) => {
                    cardRefs.current[index] = node;
                  }}
                  data-card-index={index}
                  className={`${styles.bentoCard} ${card.wide ? styles.bentoWide : ""} ${card.full ? styles.bentoFull : ""} ${visibleCards[index] ? styles.bentoVisible : ""}`}
                >
                  {card.chart ? (
                    <div className={styles.analyticsCardLayout}>
                      <div>
                        <card.icon className={styles.cardIcon} />
                        <p className={styles.cardLabel}>{card.label}</p>
                        <h3 className={styles.cardTitle}>{card.title}</h3>
                        <p className={styles.cardBody}>{card.body}</p>
                      </div>
                      <div className={styles.inlineChart}>
                        {CHART_BARS.map((height, barIndex) => (
                          <span
                            key={`bar-${height}-${barIndex}`}
                            className={styles.chartBar}
                            style={{ height: `${height}%` }}
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <card.icon className={styles.cardIcon} />
                      <p className={styles.cardLabel}>{card.label}</p>
                      <h3 className={styles.cardTitle}>{card.title}</h3>
                      <p className={styles.cardBody}>{card.body}</p>

                      {card.snippet && <code className={styles.cardSnippet}>{card.snippet}</code>}

                      {card.chips && (
                        <div className={styles.endpointChips}>
                          {card.chips.map((chip) => (
                            <span key={chip} className={styles.endpointChip}>
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="quickstart" className={styles.quickstartSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>QUICKSTART</p>
              <h2 className={styles.sectionTitle}>Up and running in 3 minutes.</h2>
            </div>

            <div className={styles.stepper}>
              {QUICKSTART_STEPS.map((step) => (
                <article key={step.number} className={styles.stepCard}>
                  <span className={styles.stepBackdropNumber}>{step.number}</span>
                  <div className={styles.stepContent}>
                    <step.icon className={styles.stepIcon} />
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepBody}>{step.body}</p>
                    <code className={styles.stepCode}>{step.command}</code>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.quickstartCtaWrap}>
              <a href="/features" className={`${styles.ctaButton} ${styles.ctaOutlineCyan}`}>
                Read the full docs →
              </a>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.pricingSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Simple, usage-based pricing.</h2>
              <p className={styles.sectionSubtitle}>Pay for what you automate. No seat fees.</p>
            </div>

            <div className={styles.pricingGrid}>
              {PRICING_PLANS.map((plan) => (
                <article
                  key={plan.name}
                  className={`${styles.pricingCard} ${plan.highlighted ? styles.pricingCardHighlighted : ""}`}
                >
                  <div className={styles.pricingTopRow}>
                    <h3 className={styles.planName}>{plan.name}</h3>
                    {plan.highlighted && <span className={styles.recommendedBadge}>RECOMMENDED</span>}
                  </div>

                  <p className={styles.planPrice}>
                    {plan.price}
                    <span className={styles.planCadence}> {plan.cadence}</span>
                  </p>

                  <ul className={styles.planFeatureList}>
                    {plan.features.map((feature) => (
                      <li key={feature} className={styles.planFeatureItem}>
                        <span className={styles.checkmark}>✓</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={plan.name === "Team" ? "/about" : "/register"}
                    className={`${styles.pricingCta} ${plan.highlighted ? styles.pricingCtaPrimary : styles.pricingCtaGhost}`}
                  >
                    {plan.cta}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="testimonials" className={styles.testimonialsSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>What developers say.</h2>
            </div>

            <div className={styles.masonryColumns}>
              {TESTIMONIALS.map((item) => (
                <article key={item.author} className={styles.testimonialCard}>
                  <p className={styles.testimonialQuote}>“{item.quote}”</p>
                  <div className={styles.testimonialAuthorRow}>
                    <span className={styles.testimonialAvatar}>{item.initials}</span>
                    <div>
                      <p className={styles.testimonialAuthor}>{item.author}</p>
                      <p className={styles.testimonialRole}>{item.role}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.finalCtaSection}>
          <div className={styles.finalCtaGrid} aria-hidden="true" />
          <div className={`${styles.container} ${styles.finalCtaContent}`}>
            <p className={styles.sectionEyebrow}>START TODAY</p>
            <h2 className={styles.finalCtaHeadline}>Stop clicking. Start automating.</h2>
            <p className={styles.finalCtaSubtext}>
              Join 2,400+ developers using InPilot to run LinkedIn on autopilot.
            </p>

            <div className={styles.finalCtaButtons}>
              <Link href="/register" className={`${styles.ctaButton} ${styles.ctaPrimary}`}>
                Get started free →
              </Link>
              <a href="/about" className={`${styles.ctaButton} ${styles.ctaGhost}`}>
                Talk to a founder
              </a>
            </div>

            <p className={styles.finalCtaMeta}>No credit card required · Cancel anytime · Open API</p>
          </div>
        </section>
      </main>

      <footer id="footer" className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <div className={styles.footerBrand}>■ InPilot</div>
              <p className={styles.footerTagline}>LinkedIn, automated.</p>
              <div className={styles.footerSocials}>
                <a href="https://github.com" className={styles.footerLink}>
                  GitHub
                </a>
                <a href="https://x.com" className={styles.footerLink}>
                  X
                </a>
              </div>
            </div>

            {FOOTER_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className={styles.footerColumnTitle}>{column.title}</h3>
                <div className={styles.footerColumnLinks}>
                  {column.links.map((item) => (
                    <a key={item} href="#" className={styles.footerLink}>
                      {item}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.footerBottomBar}>
            <span>© 2025 InPilot. Built for developers, by developers.</span>
            <div className={styles.footerBottomLinks}>
              <a href="/terms" className={styles.footerLink}>
                Terms
              </a>
              <a href="/privacy" className={styles.footerLink}>
                Privacy
              </a>
              <a href="#" className={styles.footerLink}>
                Status
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CursorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M5 3l13 7-6 2 2 6-3 1-2-6-4 4z" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 5 5" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function PlugIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M9 3v6M15 3v6M7 9h10v2a5 5 0 0 1-5 5 5 5 0 0 1-5-5z" />
      <path d="M12 16v5" />
    </svg>
  );
}

function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 20V10M10 20V6M16 20v-8M22 20H2" />
    </svg>
  );
}

function InstallIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M12 4v10M8 10l4 4 4-4" />
      <rect x="4" y="17" width="16" height="3" rx="1" />
    </svg>
  );
}

function AuthIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  );
}
