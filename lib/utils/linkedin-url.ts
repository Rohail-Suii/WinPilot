/**
 * LinkedIn job URL parsing.
 *
 * Users paste whatever LinkedIn gave them — a job permalink, a search-results
 * URL with the job selected in the side panel, a "collections" feed URL, or a
 * bare job id. All of those carry the same numeric job id, which is the only
 * part we need to build a clean, navigable job page URL.
 */

export interface ParsedLinkedInJobList {
  /** The results page to open, with per-click tracking noise removed. */
  listUrl: string;
  /** Job ids the link itself names — a fallback when the page renders no readable list. */
  jobIds: string[];
}

export interface ParsedLinkedInJob {
  jobId: string;
  /** Canonical permalink: https://www.linkedin.com/jobs/view/<id>/ */
  jobUrl: string;
}

const JOB_ID_PATTERN = /^\d{6,}$/;

/** Canonical job permalink for a numeric LinkedIn job id. */
export function buildJobUrl(jobId: string): string {
  return `https://www.linkedin.com/jobs/view/${jobId}/`;
}

/**
 * Extract the job id from any LinkedIn job link shape.
 * Returns null when the input carries no recognizable job id.
 */
export function parseLinkedInJobUrl(input: string): ParsedLinkedInJob | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // Bare job id pasted on its own
  if (JOB_ID_PATTERN.test(raw)) {
    return { jobId: raw, jobUrl: buildJobUrl(raw) };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;

  // /jobs/view/<id>, /jobs/view/<slug>-<id>, /comm/jobs/view/<id>
  const viewMatch = url.pathname.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/i);
  if (viewMatch) {
    return { jobId: viewMatch[1], jobUrl: buildJobUrl(viewMatch[1]) };
  }

  // Search results / collections / qualification-board feeds keep the opened
  // job in a query param instead of the path.
  for (const param of ["currentJobId", "jobId", "trk_job_id"]) {
    const value = url.searchParams.get(param);
    if (value && JOB_ID_PATTERN.test(value.trim())) {
      const jobId = value.trim();
      return { jobId, jobUrl: buildJobUrl(jobId) };
    }
  }

  // originToLandingJobPostings=<id>,<id>,... — the first entry is the job the
  // link was built for, and is the only usable id when currentJobId is absent.
  const landing = url.searchParams.get("originToLandingJobPostings");
  if (landing) {
    const first = landing.split(",")[0]?.trim();
    if (first && JOB_ID_PATTERN.test(first)) {
      return { jobId: first, jobUrl: buildJobUrl(first) };
    }
  }

  return null;
}

/** Query params that identify one click, not one result set — safe to drop. */
const TRACKING_PARAMS = ["trackingId", "refId", "trk", "lipi", "licu"];

/**
 * Recognize a LinkedIn *job list* page — search results, a collection, or one of
 * the "jobs that match your profile" feeds — and return a URL that reopens the
 * same result set, plus any job ids the link spells out.
 *
 * Everything LinkedIn uses to reproduce the list (keywords, filters, `origin`,
 * the encrypted `eBP` blob) is preserved; only per-click tracking is stripped.
 */
export function parseLinkedInJobListUrl(input: string): ParsedLinkedInJobList | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;

  const isListPage =
    /^\/jobs\/search(-results)?\/?$/i.test(url.pathname) ||
    /^\/jobs\/collections(\/|$)/i.test(url.pathname);
  if (!isListPage) return null;

  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);

  const jobIds: string[] = [];
  const addId = (value: string | null | undefined) => {
    const id = (value || "").trim();
    if (JOB_ID_PATTERN.test(id) && !jobIds.includes(id)) jobIds.push(id);
  };

  for (const id of (url.searchParams.get("originToLandingJobPostings") || "").split(",")) {
    addId(id);
  }
  addId(url.searchParams.get("currentJobId"));

  return { listUrl: url.toString(), jobIds };
}
