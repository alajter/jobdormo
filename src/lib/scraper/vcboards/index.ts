import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails } from "../types";
import { VC_BOARDS, DEFAULT_EXCLUDED_COMPANIES, GETRO_LOCATION_FILTER, type VcBoard } from "./boards";
import { parseTeam8Listing, parseTeam8Detail } from "./team8";
import { parseGetroSearch, isBigCompany, describeGetroJob } from "./getro";

const STOPWORDS = new Set(["of", "and", "the", "a", "an", "for", "to", "in", "&", "-"]);

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Cheap title prefilter so detail pages are fetched only for plausible roles.
// No target titles means nothing narrows the list.
export function titleMatches(title: string, targetTitles: string[]): boolean {
  if (targetTitles.length === 0) return true;
  const have = new Set(tokens(title));
  return targetTitles.some((t) => {
    const want = tokens(t);
    return want.length > 0 && want.filter((w) => have.has(w)).length >= Math.min(2, want.length);
  });
}

export function isExcludedCompany(company: string, exclude: string[]): boolean {
  const c = company.toLowerCase();
  return exclude.some((e) => e && c.startsWith(e.toLowerCase()));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_CONSTANTS.VCBOARDS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": APP_CONSTANTS.VCBOARDS_USER_AGENT, Accept: "text/html" },
    });
    if (res.status === 429) throw new Error("rate limited");
    if (!res.ok) throw new Error(`returned ${res.status}`);
    return await res.text();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTeam8(board: VcBoard, targetTitles: string[]): Promise<JobDetails[]> {
  const rows = parseTeam8Listing(await getText(`${board.baseUrl}/career/`));
  const picked = rows
    .filter((r) => titleMatches(r.title, targetTitles))
    .slice(0, APP_CONSTANTS.VCBOARDS_MAX_DETAIL_FETCHES);
  const jobs: JobDetails[] = [];
  for (const r of picked) {
    await sleep(APP_CONSTANTS.VCBOARDS_REQUEST_DELAY_MS);
    let description = "";
    try {
      description = parseTeam8Detail(await getText(r.url));
    } catch {
      // A missing detail page still leaves a usable listing row.
    }
    jobs.push({
      title: r.title,
      company: r.company,
      location: r.location,
      description: description || `<p>${r.title} at ${r.company}, ${r.location}. Listed on Team8 careers.</p>`,
      url: r.url,
    });
  }
  return jobs;
}

// Getro's filter param is base64 JSON; it narrows results to Israel so the
// first page (all a search page returns) isn't spent on other countries.
export function getroSearchUrl(baseUrl: string, q: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const filter = Buffer.from(JSON.stringify({ searchable_locations: GETRO_LOCATION_FILTER })).toString("base64");
  params.set("filter", filter);
  return `${baseUrl}/jobs?${params.toString()}`;
}

async function fetchGetro(board: VcBoard, targetTitles: string[]): Promise<JobDetails[]> {
  // One board search per target title; with no titles, the board's front page.
  const queries = (targetTitles.length ? targetTitles : [""]).slice(0, APP_CONSTANTS.VCBOARDS_MAX_QUERIES);
  const seen = new Map<string, JobDetails>();
  for (const [i, q] of queries.entries()) {
    if (i > 0) await sleep(APP_CONSTANTS.VCBOARDS_REQUEST_DELAY_MS);
    const url = getroSearchUrl(board.baseUrl, q);
    for (const job of parseGetroSearch(await getText(url))) {
      if (seen.has(job.id) || isBigCompany(job)) continue;
      if (!titleMatches(job.title, targetTitles)) continue;
      seen.set(job.id, {
        title: job.title,
        company: job.company,
        location: job.locations.join(", "),
        description: describeGetroJob(job, board.name),
        url: job.url,
        postedDate: job.createdAt ? new Date(job.createdAt * 1000).toISOString() : undefined,
        workplaceType:
          job.workMode === "remote" ? "REMOTE" : job.workMode === "hybrid" ? "HYBRID" : job.workMode === "on_site" ? "ONSITE" : undefined,
      });
    }
  }
  return [...seen.values()];
}

// Boards run one after another (one request at a time per host, with a delay),
// each isolated so one unreachable board doesn't sink the run.
export async function searchVcBoardsJobs(
  companies: { name: string; token: string }[],
  options?: { targetTitles?: string[] },
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  const targetTitles = options?.targetTitles ?? [];
  const jobs: JobDetails[] = [];
  const errors: { token: string; reason: string }[] = [];
  for (const { token } of companies) {
    const board = VC_BOARDS[token];
    if (!board) {
      errors.push({ token, reason: "is not a supported board" });
      continue;
    }
    try {
      const found = board.kind === "team8" ? await fetchTeam8(board, targetTitles) : await fetchGetro(board, targetTitles);
      jobs.push(...found.filter((j) => !isExcludedCompany(j.company, DEFAULT_EXCLUDED_COMPANIES)));
    } catch (e) {
      errors.push({ token, reason: e instanceof Error ? e.message : "failed" });
    }
  }
  return { jobs: collapseSameRole(jobs), errors };
}

// Boards overlap (a company sits in several portfolios, and Getro often links
// the same role once per LinkedIn repost plus once on the company's ATS), so
// one role can arrive several times with different URLs and location wording.
// Keep one per title+company, preferring the company's own posting over a
// LinkedIn link.
export function collapseSameRole(jobs: JobDetails[]): JobDetails[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const isLinkedIn = (u: string) => /(^|\.)linkedin\.com\//i.test(u.replace(/^https?:\/\//, ""));
  const byRole = new Map<string, JobDetails>();
  for (const j of jobs) {
    const key = `${norm(j.title)}|${norm(j.company)}`;
    const kept = byRole.get(key);
    if (!kept || (isLinkedIn(kept.url ?? "") && !isLinkedIn(j.url ?? ""))) byRole.set(key, j);
  }
  return [...byRole.values()];
}
