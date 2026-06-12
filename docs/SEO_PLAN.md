# WinPilot — Complete SEO Optimization Plan

> **Domain**: winpilot.tech  
> **Framework**: Next.js 15 (App Router)  
> **Current State**: Solid foundation, major gaps in content and rich snippets  
> **Date**: May 2026

---

## Table of Contents

1. [SEO Audit: Current State](#1-seo-audit-current-state)
2. [Keyword Strategy](#2-keyword-strategy)
3. [On-Page SEO Fixes (Quick Wins)](#3-on-page-seo-fixes-quick-wins)
4. [Technical SEO](#4-technical-seo)
5. [Content Strategy & Blog Plan](#5-content-strategy--blog-plan)
6. [Landing Page Strategy](#6-landing-page-strategy)
7. [Structured Data / Schema Markup](#7-structured-data--schema-markup)
8. [Link Building Strategy](#8-link-building-strategy)
9. [Chrome Web Store SEO](#9-chrome-web-store-seo)
10. [Tracking & Measurement](#10-tracking--measurement)
11. [Month-by-Month Execution Plan](#11-month-by-month-execution-plan)

---

## 1. SEO Audit: Current State

### What's Already Good ✅

| Element | Status | Notes |
|---|---|---|
| `metadataBase` | ✅ Set | Points to `https://winpilot.tech` |
| Title template | ✅ Set | `%s \| WinPilot` pattern |
| Root description | ✅ Keyword-rich | Covers core terms |
| OpenGraph tags | ✅ Present | title, desc, type, locale, URL |
| Twitter card | ✅ Present | card type configured |
| Robots meta | ✅ Correct | index: true, follow: true |
| Canonical tag | ✅ Set | Points to production domain |
| JSON-LD schema | ✅ SoftwareApplication | Price and features included |
| Sitemap.ts | ✅ Present | 8 URLs, priorities set |
| Robots.ts | ✅ Present | /api/ and /dashboard/ excluded |
| GA4 analytics | ✅ Present | Via env variable |

### Critical Gaps ❌

| Element | Status | Priority |
|---|---|---|
| og:image / Twitter image | ❌ Missing | **P0** — affects all social shares |
| Blog/content system | ❌ Missing | **P0** — no way to rank informational queries |
| Competitor comparison pages | ❌ Missing | **P0** — high intent, high conversion |
| Security headers | ❌ Missing | **P1** — trust signals for crawlers |
| Home page explicit metadata | ❌ Relies on layout | **P1** |
| FAQPage schema | ❌ Missing | **P1** — enables rich snippets |
| Organization schema | ❌ Missing | **P2** |
| BreadcrumbList schema | ❌ Missing | **P2** |
| Hreflang (multi-region) | ❌ Missing | **P3** — future |

---

## 2. Keyword Strategy

### Primary Target Keywords

These are high-intent, commercially valuable keywords to own:

| Keyword | Est. Monthly Searches | Competition | Intent |
|---|---|---|---|
| `auto apply linkedin jobs` | 2,400 | Medium | Transactional |
| `linkedin job automation tool` | 1,900 | Medium | Transactional |
| `linkedin easy apply automation` | 1,600 | Low-Medium | Transactional |
| `automate linkedin applications` | 1,200 | Low | Transactional |
| `apply to 100 jobs automatically` | 800 | Low | Transactional |
| `linkedin automation tool` | 8,100 | High | Transactional |
| `best linkedin automation tool 2025` | 1,400 | Medium | Commercial |

### Secondary Keywords (Feature-Specific)

| Keyword | Intent | Target Page |
|---|---|---|
| `ai resume tailoring` | Informational/Commercial | Features page + blog |
| `linkedin post scheduler` | Commercial | Features page |
| `linkedin lead generation tool` | Commercial | Features page |
| `linkedin profile optimizer` | Commercial | Features page |
| `linkedin easy apply bot` | Transactional | Landing page |
| `interview prep tool ai` | Commercial | Features page |
| `job application tracker` | Informational | Blog + features |

### Long-Tail Keywords (Blog Targets)

These are lower competition, high-conversion blog/content topics:

| Keyword | Est. Searches | Blog Post Title |
|---|---|---|
| `how to automate linkedin job applications` | 1,100/mo | "How to Automate LinkedIn Job Applications in 2025" |
| `linkedin automation without getting banned` | 880/mo | "How to Use LinkedIn Automation Without Getting Banned" |
| `how many linkedin applications per day` | 720/mo | "How Many LinkedIn Applications Per Day is Safe?" |
| `lazyapply alternative` | 590/mo | "Best LazyApply Alternatives in 2025" |
| `simplify jobs alternative` | 480/mo | "Simplify Jobs vs WinPilot: Which Is Better?" |
| `linkedin easy apply tips` | 1,300/mo | "LinkedIn Easy Apply: Tips to Get More Callbacks" |
| `resume tailoring for every job` | 720/mo | "Why You Should Tailor Your Resume for Every Job (and How to Automate It)" |
| `how to get more linkedin interviews` | 1,900/mo | "How to Get More LinkedIn Interviews in 2025" |
| `job search automation tools` | 2,400/mo | "The 7 Best Job Search Automation Tools in 2025" |
| `linkedin content strategy for job seekers` | 590/mo | "LinkedIn Content Strategy for Job Seekers" |

### Competitor Brand Keywords (Comparison SEO)

People searching for competitors are your warmest leads:

| Keyword | Create This Page |
|---|---|
| `lazyapply alternative` | `/vs/lazyapply` |
| `simplify jobs alternative` | `/vs/simplify-jobs` |
| `jobcopilot alternative` | `/vs/jobcopilot` |
| `expandi alternative` | `/vs/expandi` |
| `phantombuster alternative` | `/vs/phantombuster` |

---

## 3. On-Page SEO Fixes (Quick Wins)

### Fix 1: Add og:image to All Page Metadata

Every page share on Twitter/LinkedIn/Slack currently shows no image. This kills click-through rates.

**Create**: `/public/og-image.png` — 1200×630px, branded card showing "WinPilot — LinkedIn, automated."

**Update `app/layout.tsx`**:
```tsx
openGraph: {
  // ... existing fields
  images: [{
    url: '/og-image.png',
    width: 1200,
    height: 630,
    alt: 'WinPilot — LinkedIn Job Automation',
  }],
},
twitter: {
  card: 'summary_large_image',
  images: ['/og-image.png'],
},
```

---

### Fix 2: Add Explicit Metadata to Homepage

The homepage currently relies on layout defaults. Add a metadata export directly in `app/page.tsx`:

```tsx
export const metadata: Metadata = {
  title: 'WinPilot — Auto Apply to LinkedIn Jobs | LinkedIn Automation Tool',
  description: 'WinPilot automatically applies to 100+ LinkedIn jobs per day using AI. Tailor your resume, auto-fill Easy Apply forms, schedule posts, and generate leads — free forever.',
  keywords: [
    'auto apply linkedin jobs',
    'linkedin automation tool',
    'linkedin easy apply bot',
    'automate linkedin applications',
    'ai resume tailoring',
    'linkedin job automation',
  ],
};
```

---

### Fix 3: Update Privacy & Terms Page Titles

Current titles are generic ("Privacy Policy"). Add brand name:

```tsx
// app/privacy/page.tsx
export const metadata = {
  title: 'Privacy Policy — WinPilot LinkedIn Automation',
};

// app/terms/page.tsx
export const metadata = {
  title: 'Terms of Service — WinPilot LinkedIn Automation',
};
```

---

### Fix 4: Add Security Headers in `next.config.ts`

Security headers are a minor ranking signal and a major trust signal:

```ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

// In nextConfig:
async headers() {
  return [{ source: '/(.*)', headers: securityHeaders }];
},
```

---

### Fix 5: Add Preconnect Hints for Third-Party Resources

Speeds up page load (Core Web Vitals = ranking signal):

```tsx
// app/layout.tsx <head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link rel="dns-prefetch" href="https://www.googletagmanager.com" />
```

---

### Fix 6: Update Sitemap with Static Dates + Blog Routes

```ts
// app/sitemap.ts — use fixed dates, not new Date()
const LAST_MODIFIED = {
  home: '2026-05-01',
  features: '2026-04-15',
  about: '2026-04-01',
};

// Add blog index when created
{ url: `${BASE_URL}/blog`, lastModified: '2026-05-01', changeFrequency: 'weekly', priority: 0.8 },
```

---

## 4. Technical SEO

### Core Web Vitals Targets

Google uses CWV as a ranking factor. Current status is unknown — measure first.

| Metric | Target | How to Achieve |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | Use `next/image`, preload hero image, reduce JS |
| FID / INP (Interaction to Next Paint) | < 200ms | Code split dashboard routes, defer non-critical JS |
| CLS (Cumulative Layout Shift) | < 0.1 | Add explicit width/height to all images |

**Tools to measure**:
- Google PageSpeed Insights (pagespeed.web.dev)
- Vercel Speed Insights (already in project)
- Chrome DevTools Lighthouse

### Image Optimization

All images must use `next/image`:
```tsx
import Image from 'next/image';
<Image src="/logo.svg" width={120} height={40} alt="WinPilot Logo" priority />
```

For the hero image/screenshot, add `priority` prop to preload.

### URL Structure

Enforce consistent URLs:
- All lowercase: `/features` not `/Features`
- No trailing slashes (or consistent with trailing)
- Add in `next.config.ts`:

```ts
trailingSlash: false,
```

### 404 Page

Create `app/not-found.tsx` with:
- Branded design (not default Next.js 404)
- Links back to homepage and key sections
- Search bar or popular links

### Redirect Rules

Add canonical redirects in `next.config.ts`:
```ts
async redirects() {
  return [
    // Handle www → non-www
    {
      source: '/:path*',
      has: [{ type: 'host', value: 'www.winpilot.tech' }],
      destination: 'https://winpilot.tech/:path*',
      permanent: true,
    },
  ];
},
```

---

## 5. Content Strategy & Blog Plan

### Why a Blog is Non-Negotiable

Without a blog, WinPilot can only rank for ~5–10 pages. With a blog targeting 50+ keywords, you can rank for 100,000+ monthly organic searches over 12 months.

**The funnel**:
```
Blog reader searching "how to automate linkedin jobs"
  → Lands on WinPilot blog post
  → Reads, sees CTA "Try WinPilot free"
  → Signs up → Converts to paid
```

### Blog Architecture

```
app/
  blog/
    page.tsx              ← Blog index (list all posts)
    [slug]/
      page.tsx            ← Individual post (MDX or DB-driven)
  _posts/                 ← MDX files or CMS content
```

**Recommended**: Use MDX files with `next-mdx-remote` or `contentlayer2` for static generation with excellent SEO.

### Content Calendar — First 20 Articles

**Priority 1: Transactional (rank for buyer-intent keywords)**

| # | Title | Target Keyword | Intent |
|---|---|---|---|
| 1 | How to Automate LinkedIn Job Applications in 2025 | `automate linkedin job applications` | Informational → Transactional |
| 2 | The 7 Best LinkedIn Job Automation Tools in 2025 | `best linkedin automation tools 2025` | Commercial |
| 3 | LazyApply vs WinPilot: Which LinkedIn Tool is Better? | `lazyapply alternative` | Commercial |
| 4 | Simplify Jobs vs WinPilot: Full Comparison | `simplify jobs alternative` | Commercial |
| 5 | How to Use LinkedIn Easy Apply Effectively | `linkedin easy apply tips` | Informational |
| 6 | How to Auto-Apply to 100 LinkedIn Jobs Per Day | `auto apply linkedin jobs` | Transactional |
| 7 | Why Your LinkedIn Applications Aren't Getting Responses | `linkedin application no response` | Informational |
| 8 | AI Resume Tailoring: Does It Actually Work? | `ai resume tailoring` | Commercial |
| 9 | LinkedIn Automation Without Getting Banned (2025 Guide) | `linkedin automation without ban` | Informational |
| 10 | How Many LinkedIn Applications Per Day is Safe? | `linkedin applications per day` | Informational |

**Priority 2: Informational (capture top-of-funnel)**

| # | Title | Target Keyword |
|---|---|---|
| 11 | LinkedIn Content Strategy for Job Seekers (With Templates) | `linkedin content strategy job seekers` |
| 12 | How to Write a LinkedIn Post That Gets 10K+ Views | `how to write linkedin posts` |
| 13 | LinkedIn Job Search in 2025: The Complete Guide | `linkedin job search 2025` |
| 14 | How to Tailor Your Resume for Every Job Without Losing Your Mind | `resume tailoring every job` |
| 15 | The Best Free AI Tools for Job Seekers in 2025 | `free ai tools job seekers` |
| 16 | How to Get More LinkedIn Interviews: 10 Proven Strategies | `get more linkedin interviews` |
| 17 | LinkedIn Profile Optimization: The 2025 Checklist | `linkedin profile optimization` |
| 18 | Best Job Application Trackers in 2025 | `job application tracker` |
| 19 | LinkedIn Lead Generation: Complete B2B Playbook | `linkedin lead generation` |
| 20 | How Developers Are Using AI to Job Hunt Faster | `developer job hunt ai tools` |

### Blog Post SEO Template

Every post should follow this structure:

```markdown
---
title: "Exact keyword-rich title"
description: "150-160 char meta description with primary keyword"
publishedAt: "2026-05-15"
updatedAt: "2026-05-15"
author: "Rohail"
tags: ["linkedin", "automation", "job-search"]
---

## H1: Article Title (matches title tag)

**Introduction** (100-150 words)
- Hook: state the problem
- Preview: what this article answers
- Include primary keyword in first 100 words

## H2: Main section (include secondary keywords)
...

## H2: Step-by-step / How-to section
...

## H2: Common mistakes / FAQ
...

## Conclusion + CTA
"Start automating your LinkedIn job search with WinPilot — free forever."
[Try WinPilot Free →] button
```

### Blog SEO Requirements Per Post

- Primary keyword in: title, H1, first paragraph, meta description, URL slug
- 1,500–2,500 words (matches competitive articles)
- Internal links: 2–3 links to other blog posts and /features page
- 1 CTA button linking to signup/dashboard
- Schema: `Article` JSON-LD on every post
- Open Graph image: custom per post (use og-image template)
- Table of contents for posts > 1,500 words
- `alt` text on all images

---

## 6. Landing Page Strategy

### Comparison / Versus Pages

These pages target competitor brand searches — warmest possible leads.

**URL structure**: `winpilot.tech/vs/[competitor]`

**Pages to create**:

| URL | Target Keyword | Search Intent |
|---|---|---|
| `/vs/lazyapply` | `lazyapply alternative`, `lazyapply vs` | Evaluating alternatives |
| `/vs/simplify-jobs` | `simplify jobs alternative` | Evaluating alternatives |
| `/vs/jobcopilot` | `jobcopilot alternative` | Evaluating alternatives |
| `/vs/expandi` | `expandi alternative` | Evaluating alternatives |
| `/vs/phantombuster` | `phantombuster alternative` | Evaluating alternatives |

**Template for each `/vs/` page**:
```
H1: WinPilot vs [Competitor]: Which LinkedIn Automation Tool is Better?
Section 1: Quick comparison table (features, price, free tier, extension)
Section 2: WinPilot strengths
Section 3: [Competitor] strengths
Section 4: Which should you choose?
CTA: "Try WinPilot free — no credit card required"
```

### Use Case Landing Pages

**URL structure**: `winpilot.tech/for/[use-case]`

| URL | Target Keyword |
|---|---|
| `/for/developers` | `linkedin automation for developers` |
| `/for/job-seekers` | `automated job search tool` |
| `/for/sales-teams` | `linkedin automation sales` |
| `/for/recruiters` | `linkedin automation recruiters` |
| `/for/students` | `linkedin job search for students` |

### Feature Landing Pages

Create dedicated SEO pages for each feature (currently all bundled in /features):

| URL | Target Keyword |
|---|---|
| `/features/auto-apply` | `linkedin auto apply tool` |
| `/features/resume-tailoring` | `ai resume tailoring tool` |
| `/features/post-scheduler` | `linkedin post scheduler` |
| `/features/lead-generation` | `linkedin lead generation tool` |
| `/features/interview-prep` | `ai interview prep tool` |
| `/features/profile-optimizer` | `linkedin profile optimizer` |

---

## 7. Structured Data / Schema Markup

### Already Implemented ✅
- `SoftwareApplication` schema on root layout

### Add to Root Layout: `Organization` Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "WinPilot",
  "url": "https://winpilot.tech",
  "logo": "https://winpilot.tech/logo.svg",
  "description": "LinkedIn automation platform for job seekers and developers",
  "sameAs": [
    "https://twitter.com/winpilot",
    "https://github.com/winpilot",
    "https://www.linkedin.com/company/winpilot"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@winpilot.tech"
  }
}
```

### Add to Homepage: `FAQPage` Schema

Add below the pricing/features sections on the homepage:

```tsx
// FAQ section component with schema
const faqs = [
  {
    q: "Is WinPilot free?",
    a: "Yes, WinPilot is free forever. Use your own AI API keys (Gemini or Groq free tiers) to run automation at zero cost. Our Pro plan at $20/month includes built-in AI credits."
  },
  {
    q: "Will LinkedIn ban my account for using WinPilot?",
    a: "WinPilot uses human-like behavior simulation with randomized delays and natural interaction patterns. We only automate LinkedIn Easy Apply — a lower-risk approach. However, any automation carries some risk and violates LinkedIn's ToS."
  },
  {
    q: "How many jobs can WinPilot apply to per day?",
    a: "Free tier: 15 applications/day. Pro tier: higher limits. We cap applications to keep your account safe and your application quality high."
  },
  {
    q: "Does WinPilot work with any LinkedIn account?",
    a: "Yes. WinPilot works with any LinkedIn account via the Chrome extension. No LinkedIn Premium required."
  },
  {
    q: "What AI models does WinPilot support?",
    a: "WinPilot supports Google Gemini, OpenAI GPT-4, Anthropic Claude, Groq, and OpenRouter. You can use free tiers of Gemini or Groq to run WinPilot at zero cost."
  },
];

// JSON-LD in page
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": faqs.map(f => ({
    "@type": "Question",
    "name": f.q,
    "acceptedAnswer": { "@type": "Answer", "text": f.a }
  }))
};
```

### Add to Blog Posts: `Article` Schema

```ts
// Dynamic schema per blog post
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.title,
  "description": post.description,
  "datePublished": post.publishedAt,
  "dateModified": post.updatedAt,
  "author": {
    "@type": "Person",
    "name": post.author,
    "url": "https://winpilot.tech/about"
  },
  "publisher": {
    "@type": "Organization",
    "name": "WinPilot",
    "logo": {
      "@type": "ImageObject",
      "url": "https://winpilot.tech/logo.svg"
    }
  },
  "image": post.ogImage || "https://winpilot.tech/og-image.png",
  "url": `https://winpilot.tech/blog/${post.slug}`
}
```

### Add `HowTo` Schema for Tutorial Posts

For posts like "How to Automate LinkedIn Job Applications":

```json
{
  "@type": "HowTo",
  "name": "How to Automate LinkedIn Job Applications",
  "description": "Step-by-step guide to automating LinkedIn job applications with WinPilot",
  "step": [
    { "@type": "HowToStep", "name": "Install Chrome Extension", "text": "Download WinPilot from Chrome Web Store" },
    { "@type": "HowToStep", "name": "Create Account", "text": "Sign up free at winpilot.tech" },
    { "@type": "HowToStep", "name": "Upload Resume", "text": "Upload your resume for AI tailoring" },
    { "@type": "HowToStep", "name": "Configure Filters", "text": "Set job title, location, and other preferences" },
    { "@type": "HowToStep", "name": "Start Automation", "text": "Click Start and let WinPilot apply automatically" }
  ]
}
```

---

## 8. Link Building Strategy

### Tier 1: Easy / Free Links

| Strategy | Action |
|---|---|
| **GitHub README** | Add link from project README (if open-sourced) |
| **Product Hunt** | Product Hunt product page links to winpilot.tech |
| **Chrome Web Store** | Extension listing links to winpilot.tech |
| **Dev.to articles** | Publish tutorials on dev.to, link back |
| **Medium posts** | Cross-post blog articles to Medium with canonical |
| **Hashnode** | Cross-post to Hashnode with canonical |
| **Indie Hackers profile** | List WinPilot as your product |
| **Hacker News** | "Show HN" post (high authority domain) |
| **LinkedIn posts** | Share blog posts on LinkedIn (rel=nofollow but traffic) |

### Tier 2: Medium Effort

| Strategy | Action |
|---|---|
| **"Best LinkedIn tools" roundups** | Contact authors of top-ranking "best linkedin automation tools" articles, ask to include WinPilot |
| **LinkedIn automation subreddits** | Provide genuine value, mention WinPilot where relevant |
| **Tool comparison sites** | Submit to AlternativeTo.net, SaaSHub, G2, Capterra |
| **Career blog guest posts** | Offer to write "How to Automate Your Job Search" for career blogs |
| **Bootcamp newsletters** | Partner with coding bootcamps (CareerFoundry, The Odin Project) |

### Tier 3: Strategic

| Strategy | Action |
|---|---|
| **HARO / PR** | Respond to journalist queries on LinkedIn automation |
| **YouTube collaborations** | Partner with career/job search YouTubers for tool reviews |
| **Career coach partnerships** | Give coaches free Pro, they mention WinPilot to clients |
| **Podcast appearances** | Job search / developer career podcasts |

### Link Building Targets (Pages to Build Links To)

Prioritize building links to:
1. `winpilot.tech` (homepage) — builds overall domain authority
2. `winpilot.tech/blog/[best-performing-post]` — drives traffic to best content
3. `winpilot.tech/vs/lazyapply` etc. — competitor comparison pages

---

## 9. Chrome Web Store SEO

The Chrome Web Store is a separate search engine with millions of queries. Extension listing optimization:

### Title
```
WinPilot — LinkedIn Job Automation | Auto Apply & AI Resume
```
(Max 45 chars for search; keep key terms first)

### Short Description (132 chars)
```
Automate LinkedIn job applications. AI resume tailoring, Easy Apply bot, post scheduler, lead gen. Free forever.
```

### Detailed Description (must include these keywords)
- "linkedin automation"
- "auto apply linkedin"
- "linkedin easy apply"
- "linkedin job search automation"
- "ai resume tailoring"
- "linkedin post scheduler"

### Screenshot Strategy
5 screenshots, each showing a different feature with keyword text overlays:
1. "Apply to 100+ Jobs Per Day" — jobs dashboard
2. "AI Resume Tailored to Every Job" — resume comparison
3. "LinkedIn Post Scheduler" — content calendar
4. "Lead Generation Dashboard" — scraper view
5. "One-Click Easy Apply" — extension popup

### Category
"Productivity" — most relevant, highest search volume category

### Review Strategy
- Ask users to review after first successful application
- Respond to all reviews (increases ranking)

---

## 10. Tracking & Measurement

### Google Search Console Setup

1. Verify winpilot.tech in Google Search Console
2. Submit `https://winpilot.tech/sitemap.xml`
3. Monitor weekly:
   - Impressions by keyword
   - Click-through rate by page
   - Coverage errors (404s, blocked pages)

### GA4 Events to Track

Add these custom events for SEO intelligence:

```ts
// Track blog engagement
gtag('event', 'blog_read', {
  post_slug: slug,
  read_depth: percentage, // 25%, 50%, 75%, 100%
});

// Track CTA clicks from blog
gtag('event', 'blog_cta_click', {
  post_slug: slug,
  cta_text: 'Try WinPilot Free',
});

// Track comparison page conversions
gtag('event', 'vs_page_signup', {
  competitor: 'lazyapply',
});
```

### Weekly SEO Metrics Dashboard

Track these every Monday:

| Metric | Source | Target |
|---|---|---|
| Organic sessions | GA4 | +10%/month |
| Organic impressions | Search Console | +15%/month |
| Average position (top 10 keywords) | Search Console | < 10 |
| CTR (organic) | Search Console | > 3% |
| Blog sessions | GA4 | > 30% of organic |
| Signups from organic | GA4 (goal) | > 20% of total signups |
| Top 3 landing pages | GA4 | Monitor weekly |

### Ranking Tracker Setup

Use free tools to track keyword positions:
- **Google Search Console** (free, official)
- **Ubersuggest** (free tier, 3 keywords/day)
- **Ahrefs Webmaster Tools** (free, limited)

Target keywords to track weekly:
1. `auto apply linkedin jobs`
2. `linkedin automation tool`
3. `lazyapply alternative`
4. `linkedin easy apply automation`
5. `automate linkedin applications`

---

## 11. Month-by-Month Execution Plan

### Month 1 — Fix & Foundation

**Week 1**:
- [ ] Create og:image (1200×630px branded card)
- [ ] Add og:image to all page metadata
- [ ] Add explicit metadata export to `app/page.tsx`
- [ ] Fix Privacy/Terms page titles
- [ ] Add security headers to `next.config.ts`
- [ ] Add preconnect hints for Google Fonts and GA

**Week 2**:
- [ ] Set up Google Search Console, submit sitemap
- [ ] Set up Ahrefs Webmaster Tools
- [ ] Install and configure Posthog or Hotjar for UX insights
- [ ] Submit to: AlternativeTo.net, SaaSHub, Capterra (free tier)
- [ ] Set up blog infrastructure (MDX or headless CMS)

**Week 3**:
- [ ] Add FAQPage JSON-LD to homepage
- [ ] Add Organization JSON-LD to root layout
- [ ] Write Blog Post #1: "How to Automate LinkedIn Job Applications in 2025"
- [ ] Write Blog Post #2: "7 Best LinkedIn Automation Tools in 2025"
- [ ] Create `/vs/lazyapply` comparison page

**Week 4**:
- [ ] Publish blog posts #1 and #2
- [ ] Optimize Chrome Web Store listing with new description + screenshots
- [ ] Add `trailingSlash: false` and www redirect to next.config.ts
- [ ] Create `app/not-found.tsx` branded 404 page
- [ ] Publish on Product Hunt (if ready)

---

### Month 2 — Content Velocity

**Target**: 8 blog posts published, 3 comparison pages, first organic signups

- [ ] Publish Blog Posts #3–8 (2/week)
- [ ] Create `/vs/simplify-jobs`, `/vs/expandi` pages
- [ ] Create use case pages: `/for/developers`, `/for/job-seekers`
- [ ] Post on dev.to: "I built a tool that applies to LinkedIn jobs for me"
- [ ] Submit guest post to 1 career/tech blog
- [ ] Build HowTo schema for tutorial posts
- [ ] Add Article schema to all blog posts
- [ ] Create custom og:image per blog post (use Vercel OG)

---

### Month 3 — Authority Building

**Target**: 15 blog posts, ranking in top 20 for 5 primary keywords

- [ ] Publish Blog Posts #9–15
- [ ] Create all 5 feature landing pages (`/features/auto-apply`, etc.)
- [ ] Create all `/vs/` pages (5 total)
- [ ] Add internal linking: blog posts → feature pages → signup
- [ ] Reach out to 5 "best linkedin automation" roundup articles for inclusion
- [ ] Create 2 YouTube tutorial videos (embed in relevant blog posts)
- [ ] Launch referral program (backlinks from user sharing)
- [ ] Submit to Hacker News "Show HN"

---

### Month 4–6 — Scale

**Target**: 25+ posts, top 10 for 3+ primary keywords, 500+ organic/month

- [ ] Publish 4 posts/month (high quality > high quantity)
- [ ] Update top posts with new data and screenshots
- [ ] Create pillar page: "The Complete Guide to LinkedIn Automation (2025)"
- [ ] Start email newsletter (blog subscribers) — signals engagement to Google
- [ ] Case study posts: "User Story: How [Name] got 8 interviews in 2 weeks"
- [ ] Add review schema to homepage (testimonials)
- [ ] International landing pages if Indian/Nigerian traffic high (`/in/`, `/ng/`)

---

### Month 7–12 — Compounding Returns

**Target**: 2,000+ organic sessions/month, 200+ organic signups/month

- [ ] Refresh oldest posts with updated data
- [ ] Add video embeds to top-performing posts
- [ ] Build "State of LinkedIn Job Search" annual report (link magnet)
- [ ] PR push: pitch to TechCrunch, Forbes Careers, Business Insider
- [ ] Create free tools: "LinkedIn Profile Score" checker, "Resume ATS Scorer" (embed on site for traffic)
- [ ] International SEO: Portuguese, Spanish versions of top 5 posts

---

## Quick Reference: SEO Priority Stack

```
IMMEDIATE (do this week):
1. og:image on all pages
2. Explicit homepage metadata
3. Security headers
4. Google Search Console setup

THIS MONTH:
5. Blog infrastructure
6. First 2 blog posts
7. /vs/lazyapply comparison page
8. FAQPage schema on homepage

THIS QUARTER:
9. 20 blog posts
10. All 5 comparison pages
11. Feature landing pages
12. Chrome Web Store optimization
13. Internal linking strategy
14. Structured data on all post types

LONG TERM:
15. Domain authority via link building
16. Case studies and social proof content
17. Free tool pages
18. International SEO
```

---

*Last updated: May 2026 | Owner: Rohail-Suii | Domain: winpilot.tech*
