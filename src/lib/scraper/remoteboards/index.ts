import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails } from "../types";
import { decodeHtml } from "../html";
import { errorReason } from "../utils";
import {
  fetchBoardText,
  rssItems,
  rssTag,
  sleep,
  titleMatchesAny,
  toIsoDate,
} from "../ats/boardFetch";
import {
  HIMALAYAS_COUNTRY,
  REMOTE_BOARDS,
  isRegionOpenToUser,
  type RemoteBoard,
} from "./boards";

// Remote-job boards: Remotive's public API, Himalayas' public search API and
// We Work Remotely's category RSS feeds. Every job is remote, so each one gets
// workplaceType REMOTE and a location of "Remote (<region>)" carrying the
// board's stated region restriction. Roles whose region isn't open to the user
// (see isRegionOpenToUser) and titles that don't match the targets are dropped
// before they reach ranking. Requests run one at a time with a delay.

// ---- Remotive ---------------------------------------------------------------

interface RemotiveJob {
  url?: string;
  title?: string;
  company_name?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  description?: string;
}

export function mapRemotiveJob(job: RemotiveJob): JobDetails & { region: string } {
  const region = (job.candidate_required_location ?? "").trim();
  return {
    title: (job.title ?? "").trim(),
    company: (job.company_name ?? "").trim(),
    location: region ? `Remote (${region})` : "Remote",
    description: job.description ?? "",
    url: job.url ?? "",
    postedDate: toIsoDate(job.publication_date),
    employmentType: job.job_type?.replace(/_/g, "-") || undefined,
    workplaceType: "REMOTE",
    isRemote: true,
    region,
  };
}

// The free API returns only its latest few jobs (24h delayed) and ignores
// search/category filters, so one call per run is all it supports; the title
// filter is applied locally.
async function fetchRemotive(board: RemoteBoard): Promise<(JobDetails & { region: string })[]> {
  const res = await fetchBoardText(board.feedUrl, board.token, APP_CONSTANTS.REMOTEBOARDS_FETCH_TIMEOUT_MS, "application/json");
  if (!res.success) throw new Error(errorReason(res.error));
  if (res.data.status >= 400) throw new Error(`returned ${res.data.status}`);
  const data = JSON.parse(res.data.text) as { jobs?: RemotiveJob[] };
  if (!Array.isArray(data.jobs)) throw new Error("malformed payload");
  return data.jobs.map(mapRemotiveJob);
}

// ---- Himalayas --------------------------------------------------------------

interface HimalayasJob {
  title?: string;
  companyName?: string;
  employmentType?: string;
  locationRestrictions?: string[];
  description?: string;
  pubDate?: number;
  applicationLink?: string;
  guid?: string;
}

export function himalayasRegion(restrictions: string[] = []): string {
  if (restrictions.length === 0) return "Worldwide";
  if (restrictions.length <= 6) return restrictions.join(", ");
  const others = restrictions.length - 1;
  return restrictions.includes(HIMALAYAS_COUNTRY)
    ? `${HIMALAYAS_COUNTRY} and ${others} other countries`
    : `${restrictions.length} countries`;
}

export function mapHimalayasJob(job: HimalayasJob): JobDetails & { region: string } {
  const region = himalayasRegion(job.locationRestrictions ?? []);
  return {
    title: (job.title ?? "").trim(),
    company: (job.companyName ?? "").trim(),
    location: `Remote (${region})`,
    description: job.description ?? "",
    url: job.applicationLink || job.guid || "",
    postedDate: typeof job.pubDate === "number" ? new Date(job.pubDate * 1000).toISOString() : undefined,
    employmentType: job.employmentType || undefined,
    workplaceType: "REMOTE",
    isRemote: true,
    region,
  };
}

// One search per target title (or one unfiltered search), each narrowed to
// roles open to HIMALAYAS_COUNTRY, up to REMOTEBOARDS_MAX_PAGES pages.
async function fetchHimalayas(board: RemoteBoard, targetTitles: string[]): Promise<(JobDetails & { region: string })[]> {
  const queries = targetTitles.length
    ? targetTitles.slice(0, APP_CONSTANTS.REMOTEBOARDS_MAX_QUERIES)
    : [""];
  const out: (JobDetails & { region: string })[] = [];
  let first = true;
  for (const q of queries) {
    for (let page = 1; page <= APP_CONSTANTS.REMOTEBOARDS_MAX_PAGES; page++) {
      if (!first) await sleep(APP_CONSTANTS.REMOTEBOARDS_REQUEST_DELAY_MS);
      first = false;
      const params = new URLSearchParams({ country: HIMALAYAS_COUNTRY, page: String(page) });
      if (q) params.set("q", q);
      const res = await fetchBoardText(`${board.feedUrl}?${params}`, board.token, APP_CONSTANTS.REMOTEBOARDS_FETCH_TIMEOUT_MS, "application/json");
      if (!res.success) throw new Error(errorReason(res.error));
      if (res.data.status >= 400) throw new Error(`returned ${res.data.status}`);
      const data = JSON.parse(res.data.text) as { jobs?: HimalayasJob[]; totalCount?: number };
      if (!Array.isArray(data.jobs)) throw new Error("malformed payload");
      out.push(...data.jobs.map(mapHimalayasJob));
      if (data.jobs.length < 20 || page * 20 >= (data.totalCount ?? 0)) break;
    }
  }
  return out;
}

// ---- We Work Remotely -------------------------------------------------------

export function parseWwrRss(xml: string): (JobDetails & { region: string })[] {
  return rssItems(xml).map((item) => {
    // Titles are "Company: Role".
    const full = decodeHtml(rssTag(item, "title")).trim();
    const sep = full.indexOf(": ");
    const company = sep > 0 ? full.slice(0, sep).trim() : "";
    const title = sep > 0 ? full.slice(sep + 2).trim() : full;
    const region = decodeHtml(rssTag(item, "region")).trim();
    const type = decodeHtml(rssTag(item, "type")).trim();
    return {
      title,
      company,
      location: region ? `Remote (${region})` : "Remote",
      description: decodeHtml(rssTag(item, "description")),
      url: decodeHtml(rssTag(item, "link")).trim(),
      postedDate: toIsoDate(rssTag(item, "pubDate")),
      employmentType: type || undefined,
      workplaceType: "REMOTE",
      isRemote: true,
      region,
    };
  });
}

async function fetchWwr(board: RemoteBoard): Promise<(JobDetails & { region: string })[]> {
  const res = await fetchBoardText(board.feedUrl, board.token, APP_CONSTANTS.REMOTEBOARDS_FETCH_TIMEOUT_MS, "application/rss+xml");
  if (!res.success) throw new Error(errorReason(res.error));
  if (res.data.status >= 400) throw new Error(`returned ${res.data.status}`);
  if (!res.data.text.includes("<rss")) throw new Error("returned no RSS feed");
  return parseWwrRss(res.data.text);
}

// ---- Provider ---------------------------------------------------------------

export async function searchRemoteBoardsJobs(
  companies: { name: string; token: string }[],
  options: { targetTitles?: string[] } = {},
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  const targetTitles = options.targetTitles ?? [];
  const jobs: JobDetails[] = [];
  const errors: { token: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const [i, { token }] of companies.entries()) {
    const board = REMOTE_BOARDS[token];
    if (!board) {
      errors.push({ token, reason: "not an allowed remote board" });
      continue;
    }
    if (i > 0) await sleep(APP_CONSTANTS.REMOTEBOARDS_REQUEST_DELAY_MS);
    try {
      const raw =
        board.kind === "remotive"
          ? await fetchRemotive(board)
          : board.kind === "himalayas"
            ? await fetchHimalayas(board, targetTitles)
            : await fetchWwr(board);
      for (const { region, ...job } of raw) {
        if (!job.title || !job.url || seen.has(job.url)) continue;
        if (!isRegionOpenToUser(region)) continue;
        if (!titleMatchesAny(job.title, targetTitles)) continue;
        seen.add(job.url);
        jobs.push({ ...job, company: job.company || board.name });
      }
    } catch (error) {
      errors.push({ token, reason: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return { jobs, errors };
}
