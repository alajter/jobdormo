import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails, ScraperResult } from "../types";
import { COMEET_TOKEN_REGEX } from "./token";
import { fetchBoardText, mapWorkplace, searchBoards } from "../ats/boardFetch";

// Comeet: the hosted careers page (www.comeet.com/jobs/{slug}/{uid}) embeds
// every published position, descriptions included, as a one-line JS literal:
//   COMPANY_POSITIONS_DATA = [...];
// That needs no API token (the careers API does), so one page fetch per
// company. An unknown slug/uid redirects to comeet.com's home page.

export interface ComeetPosition {
  uid?: string;
  name?: string;
  department?: string | null;
  employment_type?: string | null;
  workplace_type?: string | null;
  time_updated?: string | null;
  url_comeet_hosted_page?: string | null;
  url_active_page?: string | null;
  company_name?: string | null;
  location?: {
    name?: string | null;
    city?: string | null;
    country?: string | null;
    is_remote?: boolean | null;
  } | null;
  custom_fields?: {
    details?: { name?: string; value?: string | null; order?: number }[];
  } | null;
}

export function comeetBoardUrl(token: string): string {
  const [slug, uid] = token.split("/");
  return `${APP_CONSTANTS.COMEET_JOB_URL}/${encodeURIComponent(slug)}/${encodeURIComponent(uid)}`;
}

// The value assigned to `NAME = ...;` on its own line, parsed as JSON.
function embeddedJson(html: string, name: string): unknown {
  const re = new RegExp(`^\\s*${name}\\s*=\\s*(.+?);?\\s*$`, "m");
  const m = html.match(re);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1].replace(/;\s*$/, ""));
  } catch {
    return undefined;
  }
}

export function parseComeetPage(
  html: string,
): { companyName?: string; positions: ComeetPosition[] } | null {
  const positions = embeddedJson(html, "COMPANY_POSITIONS_DATA");
  if (!Array.isArray(positions)) return null;
  const company = embeddedJson(html, "COMPANY_DATA") as { name?: string } | undefined;
  return { companyName: company?.name?.trim() || undefined, positions };
}

function comeetLocation(loc: ComeetPosition["location"]): string {
  if (!loc) return "";
  const name = loc.name?.trim() ?? "";
  const city = loc.city?.trim() ?? "";
  if (city && !name.toLowerCase().includes(city.toLowerCase())) {
    return name ? `${city}, ${name}` : city;
  }
  return name || city;
}

export function mapComeetPosition(p: ComeetPosition, companyName: string): JobDetails {
  const details = [...(p.custom_fields?.details ?? [])]
    .filter((d) => d.value?.trim())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const description = details
    .map((d) => (d.name ? `<h3>${d.name}</h3>${d.value}` : `${d.value}`))
    .join("\n");
  return {
    title: (p.name ?? "").trim(),
    company: companyName,
    location: comeetLocation(p.location),
    description,
    url: p.url_comeet_hosted_page || p.url_active_page || "",
    postedDate: p.time_updated ?? undefined,
    employmentType: p.employment_type ?? undefined,
    workplaceType: mapWorkplace(p.workplace_type),
  };
}

export async function fetchComeetBoardJobs(
  name: string,
  token: string,
): Promise<ScraperResult<JobDetails[]>> {
  if (!COMEET_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      error: { type: "parse", message: `Invalid Comeet token '${token}'` },
    };
  }
  const res = await fetchBoardText(
    comeetBoardUrl(token),
    token,
    APP_CONSTANTS.COMEET_FETCH_TIMEOUT_MS,
    "text/html",
  );
  if (!res.success) return res;
  const { text, status, finalUrl } = res.data;
  if (status === 404 || (status < 400 && !finalUrl.includes("/jobs/"))) {
    return {
      success: false,
      error: { type: "network", message: `No Comeet board found for '${token}'` },
    };
  }
  if (status >= 400) {
    return {
      success: false,
      error: { type: "network", message: `Board '${token}' returned ${status}` },
    };
  }
  const parsed = parseComeetPage(text);
  if (!parsed) {
    return {
      success: false,
      error: { type: "parse", message: `Board '${token}' has no positions data` },
    };
  }
  const jobs = parsed.positions
    .map((p) => mapComeetPosition(p, name))
    .filter((j) => j.title && j.url);
  return { success: true, data: jobs };
}

export async function searchComeetJobs(
  companies: { name: string; token: string }[],
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  return searchBoards(
    companies,
    {
      concurrency: APP_CONSTANTS.COMEET_FETCH_CONCURRENCY,
      delayMs: APP_CONSTANTS.COMEET_REQUEST_DELAY_MS,
    },
    ({ name, token }) => fetchComeetBoardJobs(name, token),
  );
}
