import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails, ScraperResult } from "../types";
import { ATS_TOKEN_REGEX } from "../utils";
import { fetchBoardText, searchBoards } from "../ats/boardFetch";

// Workable: the public careers widget API
// (apply.workable.com/api/v1/widget/accounts/{slug}?details=true) returns the
// account name and every published job with its description in one GET. It is
// what www.workable.com/api/accounts/{slug} redirects to. Unknown slugs 404.

export interface WorkableJob {
  title?: string;
  shortcode?: string;
  employment_type?: string | null;
  telecommuting?: boolean | null;
  department?: string | null;
  url?: string | null;
  shortlink?: string | null;
  published_on?: string | null;
  created_at?: string | null;
  country?: string | null;
  city?: string | null;
  state?: string | null;
  locations?: { country?: string | null; city?: string | null; region?: string | null; hidden?: boolean }[];
  description?: string | null;
}

export interface WorkableAccount {
  name?: string;
  description?: string | null;
  jobs?: WorkableJob[];
}

export function workableWidgetUrl(token: string, details = true): string {
  return `${APP_CONSTANTS.WORKABLE_WIDGET_URL}/${encodeURIComponent(token)}${details ? "?details=true" : ""}`;
}

function workableLocation(job: WorkableJob): string {
  const listed = (job.locations ?? [])
    .filter((l) => !l.hidden)
    .map((l) => [l.city, l.country].map((v) => v?.trim()).filter(Boolean).join(", "));
  const fallback = [job.city, job.country].map((v) => v?.trim()).filter(Boolean).join(", ");
  const places = Array.from(new Set([...listed, fallback].filter(Boolean)));
  const where = places.join("; ");
  if (job.telecommuting) return where ? `Remote (${where})` : "Remote";
  return where;
}

export function mapWorkableJob(job: WorkableJob, companyName: string): JobDetails {
  return {
    title: (job.title ?? "").trim(),
    company: companyName,
    location: workableLocation(job),
    description: job.description?.trim() ?? "",
    url: job.url || job.shortlink || "",
    postedDate: job.published_on || job.created_at || undefined,
    employmentType: job.employment_type || undefined,
    // The widget only says whether a job is remote; hybrid/on-site are not
    // distinguished, so non-remote jobs leave workplaceType unset.
    workplaceType: job.telecommuting ? "REMOTE" : undefined,
  };
}

export async function fetchWorkableBoardJobs(
  name: string,
  token: string,
): Promise<ScraperResult<JobDetails[]>> {
  if (!ATS_TOKEN_REGEX.test(token)) {
    return {
      success: false,
      error: { type: "parse", message: `Invalid Workable token '${token}'` },
    };
  }
  const res = await fetchBoardText(
    workableWidgetUrl(token),
    token,
    APP_CONSTANTS.WORKABLE_FETCH_TIMEOUT_MS,
    "application/json",
  );
  if (!res.success) return res;
  const { text, status } = res.data;
  if (status === 404) {
    return {
      success: false,
      error: { type: "network", message: `No Workable account found for '${token}'` },
    };
  }
  if (status >= 400) {
    return {
      success: false,
      error: { type: "network", message: `Board '${token}' returned ${status}` },
    };
  }
  let data: WorkableAccount;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      success: false,
      error: { type: "parse", message: `Board '${token}' malformed payload` },
    };
  }
  if (data.jobs !== undefined && !Array.isArray(data.jobs)) {
    return {
      success: false,
      error: { type: "parse", message: `Board '${token}' malformed payload` },
    };
  }
  const jobs = (data.jobs ?? [])
    .map((job) => mapWorkableJob(job, name))
    .filter((j) => j.title && j.url);
  return { success: true, data: jobs };
}

export async function searchWorkableJobs(
  companies: { name: string; token: string }[],
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  return searchBoards(
    companies,
    {
      concurrency: APP_CONSTANTS.WORKABLE_FETCH_CONCURRENCY,
      delayMs: APP_CONSTANTS.WORKABLE_REQUEST_DELAY_MS,
    },
    ({ name, token }) => fetchWorkableBoardJobs(name, token),
  );
}
