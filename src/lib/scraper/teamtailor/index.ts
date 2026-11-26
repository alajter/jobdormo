import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails, ScraperResult } from "../types";
import { ATS_TOKEN_REGEX } from "../utils";
import { decodeHtml } from "../html";
import {
  fetchBoardText,
  mapWorkplace,
  rssItems,
  rssTag,
  rssTags,
  searchBoards,
  toIsoDate,
} from "../ats/boardFetch";

// Teamtailor: every career site, custom domain or not, answers on
// {slug}.teamtailor.com. Its public /jobs.rss lists each open job with the
// full description (entity-encoded HTML), locations and remote status, so one
// request per company. The token is the slug; only teamtailor.com is fetched.

export function teamtailorBoardUrl(token: string): string {
  return `https://${token}.${APP_CONSTANTS.TEAMTAILOR_HOST_SUFFIX}/jobs`;
}

function itemLocation(item: string): string {
  const places = rssTags(item, "tt:location").map((loc) => {
    const city = decodeHtml(rssTag(loc, "tt:city"));
    const country = decodeHtml(rssTag(loc, "tt:country"));
    const name = decodeHtml(rssTag(loc, "tt:name"));
    return [city || name, country].filter(Boolean).join(", ");
  });
  return Array.from(new Set(places.filter(Boolean))).join("; ");
}

export function parseTeamtailorRss(
  xml: string,
  companyName: string,
): JobDetails[] {
  return rssItems(xml)
    .map((item) => {
      const workplaceType = mapWorkplace(rssTag(item, "remoteStatus"));
      const location = itemLocation(item);
      return {
        title: decodeHtml(rssTag(item, "title")).trim(),
        company: companyName,
        location: location || (workplaceType === "REMOTE" ? "Remote" : ""),
        description: decodeHtml(rssTag(item, "description")),
        url: decodeHtml(rssTag(item, "link")).trim(),
        postedDate: toIsoDate(rssTag(item, "pubDate")),
        workplaceType,
      };
    })
    .filter((j) => j.title && j.url);
}

export async function fetchTeamtailorBoardJobs(
  name: string,
  token: string,
): Promise<ScraperResult<JobDetails[]>> {
  if (!ATS_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      error: { type: "parse", message: `Invalid Teamtailor token '${token}'` },
    };
  }
  const res = await fetchBoardText(
    `${teamtailorBoardUrl(token)}.rss`,
    token,
    APP_CONSTANTS.TEAMTAILOR_FETCH_TIMEOUT_MS,
    "application/rss+xml",
  );
  if (!res.success) return res;
  const { text, status } = res.data;
  if (status === 404) {
    return {
      success: false,
      error: { type: "network", message: `No Teamtailor site found for '${token}'` },
    };
  }
  if (status >= 400) {
    return {
      success: false,
      error: { type: "network", message: `Board '${token}' returned ${status}` },
    };
  }
  if (!text.includes("<rss")) {
    return {
      success: false,
      error: { type: "parse", message: `Board '${token}' returned no RSS feed` },
    };
  }
  return { success: true, data: parseTeamtailorRss(text, name) };
}

export async function searchTeamtailorJobs(
  companies: { name: string; token: string }[],
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  return searchBoards(
    companies,
    {
      concurrency: APP_CONSTANTS.TEAMTAILOR_FETCH_CONCURRENCY,
      delayMs: APP_CONSTANTS.TEAMTAILOR_REQUEST_DELAY_MS,
    },
    ({ name, token }) => fetchTeamtailorBoardJobs(name, token),
  );
}
