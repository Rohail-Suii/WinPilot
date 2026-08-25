/**
 * Search-URL builders for each supported job platform, plus the keyword
 * splitting shared by both. Kept out of the automate route so they're
 * unit-testable without mocking Next.js/DB, and so `automate/route.ts` stays
 * a thin per-step orchestrator.
 */

export interface JobSearchFilters {
  location?: string;
  remote?: boolean;
  experienceLevel?: string[];
  datePosted?: string;
  easyApplyOnly?: boolean;
}

// Split a comma-separated keywords string into individual search phrases.
// Neither platform's keyword search handles a single query containing
// multiple comma-separated phrases well (it's matched close to literally),
// so each phrase is run as its own search instead.
export function splitKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      (raw || "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    )
  );
}

// LinkedIn search URL builder — builds a search URL for a single keyword phrase
export function buildLinkedInSearchURL(search: JobSearchFilters, keyword: string): string {
  const params = new URLSearchParams();
  params.set("keywords", keyword);
  if (search.location) params.set("location", search.location);

  // LinkedIn f_TPR (time posted range)
  const timeMap: Record<string, string> = {
    "past-24h": "r86400",
    "past-week": "r604800",
    "past-month": "r2592000",
  };
  if (search.datePosted && timeMap[search.datePosted]) {
    params.set("f_TPR", timeMap[search.datePosted]);
  }

  // Experience level mapping
  const expMap: Record<string, string> = {
    internship: "1",
    entry: "2",
    associate: "3",
    "mid-senior": "4",
    director: "5",
    executive: "6",
  };
  if (search.experienceLevel?.length) {
    params.set("f_E", search.experienceLevel.map((e) => expMap[e] || "").filter(Boolean).join(","));
  }

  if (search.remote) params.set("f_WT", "2"); // Remote
  if (search.easyApplyOnly) params.set("f_AL", "true"); // Easy Apply

  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

// Indeed search URL builder — builds a search URL for a single keyword phrase.
// Indeed has no query-param equivalent of LinkedIn's f_E (experience level) or
// f_AL (Easy Apply only) filters, so those two `search` fields have no effect
// here — Indeed Apply eligibility is instead read per-job off the scraped
// listing, the same way LinkedIn's `easyApply` field already is.
export function buildIndeedSearchURL(search: JobSearchFilters, keyword: string): string {
  const params = new URLSearchParams();
  params.set("q", keyword);
  const location = search.remote ? "Remote" : search.location;
  if (location) params.set("l", location);

  // Indeed fromage (days since posted)
  const dateMap: Record<string, string> = {
    "past-24h": "1",
    "past-week": "7",
    "past-month": "30",
  };
  if (search.datePosted && dateMap[search.datePosted]) {
    params.set("fromage", dateMap[search.datePosted]);
  }

  return `https://www.indeed.com/jobs?${params.toString()}`;
}
