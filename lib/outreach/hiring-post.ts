/**
 * Reading a feed post as a job opening.
 *
 * The agent walks the feed all day and the AI already tells us whether a post
 * reads as "hiring". That classification is the *intent*; this module is the
 * *contact route* — the address to apply to, or the form to open when there is
 * no address. It is deliberately deterministic (no AI, no network): the agent
 * cannot afford one more model call per post, and an email address either is
 * or is not written on the page.
 *
 * Everything here works on the post as a reader sees it, so the first thing it
 * does is undo the two tricks LinkedIn writers use that break naive regexes:
 * Unicode "fancy" letters (𝐇𝐢𝐫𝐢𝐧𝐠) and obfuscated addresses (hr [at] x dot com).
 */

/** A link scraped off the post, already resolved past LinkedIn's redirector. */
export interface PostLink {
  href: string;
  text?: string;
}

export interface HiringDetection {
  /** Did this read as a job opening at all? */
  isHiring: boolean;
  /** 0–1. How strongly the text says so — used for the low-confidence review lane. */
  confidence: number;
  /** Which phrases fired, so the dashboard can explain itself. */
  signals: string[];
  /** Addresses to apply to, best first. */
  emails: string[];
  /** Forms/ATS/careers links to apply through when there is no address. */
  applyLinks: string[];
  /** Best guess at the role, for the subject line. Empty when unsure. */
  roleTitle: string;
  /** Best guess at the employer. Empty when unsure. */
  company: string;
}

/**
 * Post text as plain ASCII-ish characters.
 *
 * LinkedIn writers style headings with Mathematical Alphanumeric Symbols
 * (U+1D400+) because the composer has no bold button. NFKC folds those, along
 * with fullwidth forms and ligatures, back to the letters they represent — so
 * "𝐀𝐩𝐩𝐥𝐲 𝐇𝐞𝐫𝐞" becomes matchable and "𝐡𝐫@𝐧𝐞𝐱𝐮𝐬𝟗𝟓.𝐜𝐨𝐦" becomes a real address.
 */
export function normalizeText(raw: string): string {
  return (raw || "")
    .normalize("NFKC")
    // Zero-width joiners and non-breaking spaces sit inside pasted addresses.
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ");
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * De-obfuscate the "write it out so bots miss it" spellings.
 *
 * Only the bracketed and parenthesised forms plus a bare " at " that is fenced
 * by spaces on both sides are rewritten. A bare "at" without spaces would turn
 * every "chat" into an address.
 */
function deobfuscate(text: string): string {
  return text
    .replace(/\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/gi, "@")
    .replace(/\s*[[({<]\s*dot\s*[\])}>]\s*/gi, ".")
    .replace(/([A-Za-z0-9._%+-])\s+at\s+([A-Za-z0-9-]+\s+dot\s+[A-Za-z]{2,})/gi, "$1@$2")
    .replace(/([A-Za-z0-9-])\s+dot\s+([A-Za-z]{2,})/gi, "$1.$2");
}

/** Addresses that are never a person you can apply to. */
const REJECTED_LOCAL_PARTS =
  /^(?:noreply|no-reply|donotreply|do-not-reply|notifications?|mailer-daemon|postmaster|abuse|unsubscribe|support@linkedin|privacy)/i;

const REJECTED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "domain.com",
  "yourcompany.com",
  "company.com",
  "email.com",
  "linkedin.com",
  "sentry.io",
  "w3.org",
  "schema.org",
]);

/** File extensions that look like a TLD when an image name is glued to an @. */
const IMAGE_TAIL = /\.(?:png|jpe?g|gif|svg|webp|css|js|json|html?)$/i;

function isPlausibleAddress(email: string): boolean {
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (email.length > 254 || local.length > 64) return false;
  if (REJECTED_LOCAL_PARTS.test(local)) return false;
  if (IMAGE_TAIL.test(domain)) return false;

  const lower = domain.toLowerCase();
  if (REJECTED_DOMAINS.has(lower)) return false;
  // media.licdn.com and friends — LinkedIn's own asset hosts.
  if (/\b(?:licdn|linkedin)\.com$/i.test(lower)) return false;

  const tld = lower.split(".").pop() || "";
  return /^[a-z]{2,24}$/.test(tld);
}

/**
 * Rank addresses so the one we write to is the one meant for applications.
 *
 * A post that names both `hr@` and the poster's personal address should get the
 * application, not the chat.
 */
const PREFERRED_LOCAL_PARTS = [
  "career",
  "careers",
  "job",
  "jobs",
  "hiring",
  "recruit",
  "recruitment",
  "recruiting",
  "hr",
  "talent",
  "apply",
  "application",
  "applications",
  "cv",
  "resume",
  "people",
];

function addressRank(email: string): number {
  const local = email.split("@")[0].toLowerCase();
  const hit = PREFERRED_LOCAL_PARTS.findIndex((p) => local === p || local.startsWith(p));
  if (hit >= 0) return hit;
  // Generic inboxes still beat an unrelated personal address.
  if (/^(?:info|contact|admin|office|team)$/.test(local)) return 90;
  return 50;
}

/**
 * Every address written on the post, best first.
 *
 * `mailto:` hrefs are read as well as the text: LinkedIn renders a recognised
 * address as a link, and on some cards the visible label is truncated while the
 * href still carries the whole thing.
 */
export function extractEmails(
  content: string,
  links: PostLink[] = [],
  exclude: string[] = []
): string[] {
  const excluded = new Set(exclude.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const found = new Map<string, number>();

  const consider = (raw: string, bonus: number) => {
    const email = raw.trim().replace(/^[.,;:<([]+|[.,;:>)\]]+$/g, "").toLowerCase();
    if (!isPlausibleAddress(email)) return;
    if (excluded.has(email)) return;
    const rank = addressRank(email) + bonus;
    const seen = found.get(email);
    if (seen === undefined || rank < seen) found.set(email, rank);
  };

  for (const link of links) {
    const href = (link.href || "").trim();
    if (!/^mailto:/i.test(href)) continue;
    // A mailto can carry ?subject=…, and several addresses comma-separated.
    const addresses = decodeURIComponent(href.slice(7).split("?")[0]);
    // An explicit mailto is the author's own "write to me here", so it wins
    // ties against the same address merely mentioned in the prose.
    for (const address of addresses.split(/[,;]/)) consider(address, -10);
  }

  const text = deobfuscate(normalizeText(content));
  for (const match of text.match(EMAIL_RE) || []) consider(match, 0);

  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([email]) => email);
}

/** Hosts that exist to collect an application. */
const APPLY_HOSTS = [
  "docs.google.com",
  "forms.gle",
  "forms.office.com",
  "typeform.com",
  "tally.so",
  "jotform.com",
  "airtable.com",
  "notion.site",
  "lever.co",
  "greenhouse.io",
  "workable.com",
  "ashbyhq.com",
  "smartrecruiters.com",
  "breezy.hr",
  "jobvite.com",
  "recruitee.com",
  "teamtailor.com",
  "bamboohr.com",
  "zohorecruit.com",
  "wellfound.com",
  "indeed.com",
  "rozee.pk",
];

/** URL shorteners — opaque, so they only count when the post says "apply". */
const SHORTENER_HOSTS = ["lnkd.in", "bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "shorturl.at"];

const APPLY_PATH = /\/(?:careers?|jobs?|apply|vacanc|openings?|hiring|positions?)\b/i;

function hostMatches(hostname: string, list: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Links worth saving when there is no address to write to.
 *
 * This is the "we could not email, so keep the link" path: the user opens these
 * by hand from the dashboard, so a false positive costs a glance and a false
 * negative costs an opportunity. It errs towards keeping the link.
 */
export function extractApplyLinks(content: string, links: PostLink[] = []): string[] {
  const text = normalizeText(content);
  const candidates = new Set<string>();

  const bare = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  for (const href of [...links.map((l) => l.href || ""), ...bare]) {
    const clean = href.trim().replace(/[.,;:)]+$/, "");
    if (!/^https?:\/\//i.test(clean)) continue;

    let url: URL;
    try {
      url = new URL(clean);
    } catch {
      continue;
    }

    // LinkedIn's own pages are where we already are — a job permalink is the
    // exception, since that is a real destination to apply through.
    if (hostMatches(url.hostname, ["linkedin.com"])) {
      if (/\/jobs\/(?:view|collections)/i.test(url.pathname)) candidates.add(url.toString());
      continue;
    }

    if (
      hostMatches(url.hostname, APPLY_HOSTS) ||
      hostMatches(url.hostname, SHORTENER_HOSTS) ||
      APPLY_PATH.test(url.pathname)
    ) {
      candidates.add(url.toString());
    }
  }

  return [...candidates].slice(0, 8);
}

/**
 * Phrases that mean someone is being hired, weighted by how sure they make us.
 *
 * The weights are calibrated so that one unambiguous phrase ("we are hiring",
 * "send your CV to") is enough on its own, while the weak signals need to
 * cluster — "role" and "remote" appear in half the posts on any tech feed.
 */
const HIRING_SIGNALS: [RegExp, number, string][] = [
  [/\b(?:we|they|our team|our client)\s+(?:are|is|(?:'|’)re)\s+hiring\b/i, 0.55, "says they are hiring"],
  [/\b(?:we|they)(?:'|’)re\s+hiring\b/i, 0.55, "says they are hiring"],
  [/\bis hiring\b/i, 0.55, "says they are hiring"],
  [/\b(?:now hiring|hiring now|urgently hiring|actively hiring)\b/i, 0.55, "hiring now"],
  [/#hiring\b/i, 0.4, "#hiring"],
  [/#(?:jobopportunity|hiringnow|jobalert|jobopening|nowhiring|jobs)\b/i, 0.25, "hiring hashtag"],
  [/\b(?:send|share|email|drop|forward)\s+(?:me\s+)?(?:your|ur|the)?\s*(?:updated\s+)?(?:cv|resume|resumé|portfolio|profile)\b/i, 0.5, "asks for a CV"],
  [/\bapply\s+(?:here|now|at|via|through|by|to|on)\b/i, 0.4, "says how to apply"],
  [/\b(?:job|role|position|vacancy|vacancies|opening|opportunity)\b/i, 0.15, "mentions a role"],
  [/\b(?:looking for|seeking|in search of)\s+(?:an?\s+)?[a-z ]{0,20}(?:developer|engineer|designer|manager|analyst|architect|consultant|specialist|intern|writer|marketer)\b/i, 0.4, "looking for a specific role"],
  [/\b(?:requirements?|responsibilities|qualifications?|must have|skills required)\b/i, 0.2, "lists requirements"],
  [/\b(?:full[- ]time|part[- ]time|contract|freelance|project[- ]based|internship)\b/i, 0.15, "names an engagement type"],
  [/\b(?:salary|compensation|ctc|package|pay range)\b/i, 0.15, "mentions pay"],
  [/\b(?:join our team|join us|be part of our team)\b/i, 0.3, "invites you to join"],
  [/\bdm\s+(?:me|us)\b.{0,40}\b(?:interested|cv|resume|apply|role)\b/i, 0.3, "asks for a DM"],
];

/** Phrases that mean the opposite: someone is looking FOR work, not offering it. */
const SEEKING_SIGNALS = [
  /#(?:opentowork|openforwork|lookingforwork|needjob)\b/i,
  /\bi\s*(?:'|’)?m\s+(?:currently\s+)?(?:looking for|seeking|open to|available for)\b/i,
  /\b(?:i|my)\s+(?:was\s+)?(?:recently\s+)?(?:got\s+)?laid off\b/i,
  /\bplease\s+(?:refer|reach out).{0,30}\bme\b/i,
];

/**
 * How strongly the post reads as an opening, plus the phrases that said so.
 *
 * `seeking` is the veto: someone announcing their own job hunt. It is reported
 * separately from the score because it has to outrank the model's opinion as
 * well as the text's — writing an application to another job seeker is the one
 * mistake in this feature that is actively embarrassing.
 */
export function scoreHiringSignals(content: string): {
  score: number;
  signals: string[];
  seeking: boolean;
} {
  const text = normalizeText(content);
  const signals: string[] = [];
  let score = 0;

  for (const [pattern, weight, label] of HIRING_SIGNALS) {
    if (!pattern.test(text)) continue;
    // Each phrase counts once, however often it appears.
    if (!signals.includes(label)) {
      signals.push(label);
      score += weight;
    }
  }

  // A job seeker's post can carry every hiring word there is. Their own "I am
  // looking" is the one phrase an employer never writes, so it wins outright.
  for (const pattern of SEEKING_SIGNALS) {
    if (pattern.test(text)) {
      return { score: 0, signals: ["reads as a job seeker's own post"], seeking: true };
    }
  }

  return { score: Math.min(1, score), signals, seeking: false };
}

const ROLE_PATTERNS = [
  /\bhiring\s+(?:an?\s+|for\s+(?:an?\s+)?)?([A-Za-z][A-Za-z0-9/&+.\- ]{2,48}?)(?:\s+(?:on|at|for|in|to)\b|[!,.\n(]|$)/i,
  /\b(?:looking for|seeking|we need|we want)\s+(?:an?\s+)?([A-Za-z][A-Za-z0-9/&+.\- ]{2,48}?)(?:\s+(?:to|who|with|at|for|in)\b|[!,.\n(]|$)/i,
  /\b(?:role|position|job title|title|vacancy)\s*[:\-–]\s*([A-Za-z][A-Za-z0-9/&+.\- ]{2,48})/i,
  /\b(?:open(?:ing)?s? for)\s+(?:an?\s+)?([A-Za-z][A-Za-z0-9/&+.\- ]{2,48})/i,
];

/** Words that mean the capture ran past the end of the title. */
const ROLE_STOPWORDS = /\b(?:on project basis|remote|urgently|immediately|asap|please|apply)\b/i;

/** Best-effort role title, for the subject line. Empty when it is a guess. */
export function extractRoleTitle(content: string): string {
  const text = normalizeText(content);
  for (const pattern of ROLE_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const title = match[1]
      .split(ROLE_STOPWORDS)[0]
      .replace(/\s+/g, " ")
      .replace(/[-–—:,.]+$/, "")
      .trim();
    if (title.length >= 3 && title.length <= 60 && /[a-z]/i.test(title)) return title;
  }
  return "";
}

/**
 * Best-effort employer name.
 *
 * The post's own "X is hiring" beats the author's name, because the author is
 * often a recruiter posting on a client's behalf. The email domain is the last
 * resort — it is right far more often than it is wrong.
 */
export function extractCompany(content: string, authorName = "", emails: string[] = []): string {
  const text = normalizeText(content);
  const stated = text.match(/^\s*([A-Z][A-Za-z0-9&.\- ]{1,40}?)\s+is\s+(?:hiring|looking|seeking)/m);
  if (stated?.[1]) return stated[1].trim();

  const atCompany = text.match(/\b(?:at|join)\s+([A-Z][A-Za-z0-9&.\-]{1,30}(?:\s+[A-Z][A-Za-z0-9&.\-]{1,30})?)\b/);
  if (atCompany?.[1]) return atCompany[1].trim();

  const domain = (emails[0] || "").split("@")[1] || "";
  const generic = /^(?:gmail|outlook|hotmail|yahoo|proton|protonmail|icloud|aol|zoho|mail)\./i;
  if (domain && !generic.test(domain)) {
    const label = domain.split(".")[0];
    if (label.length > 1) return label.charAt(0).toUpperCase() + label.slice(1);
  }

  return authorName.trim();
}

/** Above this, the post is treated as an opening without asking the model. */
export const HIRING_THRESHOLD = 0.5;

/**
 * Read one feed post as a possible opening.
 *
 * `aiPostType` is the classification the comment generator already produced.
 * When it says "hiring" that is authoritative — it read the whole post with
 * context — so the text score only has to carry posts the model never saw
 * (a like-only pass, or a spent AI budget).
 */
export function detectHiringPost(input: {
  content: string;
  links?: PostLink[];
  authorName?: string;
  /** postType from the feed comment generator, when one was produced. */
  aiPostType?: string;
  /** Addresses that are the user's own — never a lead. */
  excludeEmails?: string[];
}): HiringDetection {
  const { score, signals, seeking } = scoreHiringSignals(input.content);
  const emails = extractEmails(input.content, input.links, input.excludeEmails);
  const applyLinks = extractApplyLinks(input.content, input.links);

  // The model classifies a post about a job as "hiring" whichever direction the
  // job is going, so the seeker veto has to sit above it rather than beside it.
  const aiSaysHiring = input.aiPostType === "hiring" && !seeking;
  const confidence = aiSaysHiring ? Math.max(score, 0.8) : score;
  // An address next to hiring language is the strongest combination there is;
  // on its own it is just a contact detail in someone's signature.
  const isHiring =
    !seeking && (confidence >= HIRING_THRESHOLD || (score >= 0.3 && emails.length > 0));

  return {
    isHiring,
    confidence: Number(confidence.toFixed(2)),
    signals: aiSaysHiring && !signals.length ? ["classified as a hiring post"] : signals,
    emails,
    applyLinks,
    roleTitle: extractRoleTitle(input.content),
    company: extractCompany(input.content, input.authorName, emails),
  };
}
