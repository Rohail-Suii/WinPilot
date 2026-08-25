/**
 * Indeed job URL parsing.
 *
 * Indeed identifies a job by its `jk` value — a hex string, unlike LinkedIn's
 * numeric job ids — carried as a query param on both the canonical view page
 * and the tracked redirect link Indeed hands out from search results.
 */

export interface ParsedIndeedJobList {
  /** The results page to open, with per-click tracking noise removed. */
  listUrl: string;
  /** Job ids the link itself names — a fallback when the page renders no readable list. */
  jobIds: string[];
}

export interface ParsedIndeedJob {
  jobId: string;
  /** Canonical permalink: https://www.indeed.com/viewjob?jk=<id> */
  jobUrl: string;
}

const JOB_ID_PATTERN = /^[0-9a-f]{8,}$/i;

/** Canonical job permalink for an Indeed `jk` job id. */
export function buildIndeedJobUrl(jobId: string): string {
  return `https://www.indeed.com/viewjob?jk=${jobId}`;
}

/**
 * Extract the job id from any Indeed job link shape.
 * Returns null when the input carries no recognizable job id.
 */
export function parseIndeedJobUrl(input: string): ParsedIndeedJob | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  // Bare job id pasted on its own
  if (JOB_ID_PATTERN.test(raw)) {
    return { jobId: raw.toLowerCase(), jobUrl: buildIndeedJobUrl(raw.toLowerCase()) };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)indeed\.com$/i.test(url.hostname)) return null;

  // /viewjob?jk=<id>, /rc/clk?jk=<id>, /pagead/clk?jk=<id>, /company/.../jobs/.../<id>?jk=<id>
  for (const param of ["jk", "vjk"]) {
    const value = url.searchParams.get(param);
    if (value && JOB_ID_PATTERN.test(value.trim())) {
      const jobId = value.trim().toLowerCase();
      return { jobId, jobUrl: buildIndeedJobUrl(jobId) };
    }
  }

  return null;
}

/** Query params that identify one click, not one result set — safe to drop. */
const TRACKING_PARAMS = ["tk", "atk", "advn", "vjk", "rgtk", "cmp"];

/**
 * Recognize an Indeed *job list* page — a keyword search or a saved-search
 * results page — and return a URL that reopens the same result set, plus any
 * job ids the link spells out.
 */
export function parseIndeedJobListUrl(input: string): ParsedIndeedJobList | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  if (!/(^|\.)indeed\.com$/i.test(url.hostname)) return null;

  const isListPage = /^\/jobs\/?$/i.test(url.pathname);
  if (!isListPage) return null;

  const jobIds: string[] = [];
  const addId = (value: string | null | undefined) => {
    const id = (value || "").trim().toLowerCase();
    if (JOB_ID_PATTERN.test(id) && !jobIds.includes(id)) jobIds.push(id);
  };
  addId(url.searchParams.get("vjk"));
  addId(url.searchParams.get("jk"));

  for (const param of TRACKING_PARAMS) url.searchParams.delete(param);

  return { listUrl: url.toString(), jobIds };
}
