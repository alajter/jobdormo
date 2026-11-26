import pLimit from "p-limit";
import { APP_CONSTANTS } from "@/lib/constants";
import type { JobDetails, ScraperResult } from "../types";
import { errorReason } from "../utils";

// Shared plumbing for the page/feed-based ATS providers (Comeet, Teamtailor,
// Workable): a polite GET with a timeout and the app's honest User-Agent, and
// a bounded-concurrency watchlist runner with per-token error isolation.

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface FetchedText {
  text: string;
  status: number;
  finalUrl: string;
}

// GET a URL as text. 429 maps to rate_limited, other non-2xx and 404s are left
// to the caller (status is returned) so providers can word "not found" errors.
export async function fetchBoardText(
  url: string,
  label: string,
  timeoutMs: number,
  accept = "*/*",
): Promise<ScraperResult<FetchedText>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": APP_CONSTANTS.ATS_USER_AGENT, Accept: accept },
    });
    if (res.status === 429) {
      res.body?.cancel();
      return { success: false, error: { type: "rate_limited" } };
    }
    const text = res.ok ? await res.text() : "";
    if (!res.ok) res.body?.cancel();
    return {
      success: true,
      data: { text, status: res.status, finalUrl: res.url || url },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: { type: "network", message: `Board '${label}' timed out` },
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: { type: "network", message } };
  } finally {
    clearTimeout(timer);
  }
}

// Run fetchOne over a watchlist with bounded concurrency and a small delay
// before each request; one board's failure never sinks the others.
export async function searchBoards<C extends { name: string; token: string }>(
  companies: C[],
  opts: { concurrency: number; delayMs: number },
  fetchOne: (company: C) => Promise<ScraperResult<JobDetails[]>>,
): Promise<{ jobs: JobDetails[]; errors: { token: string; reason: string }[] }> {
  const limit = pLimit(opts.concurrency);
  const settled = await Promise.allSettled(
    companies.map((company, index) =>
      limit(async () => {
        if (index >= opts.concurrency && opts.delayMs > 0) {
          await sleep(opts.delayMs);
        }
        return fetchOne(company);
      }),
    ),
  );

  const jobs: JobDetails[] = [];
  const errors: { token: string; reason: string }[] = [];
  settled.forEach((result, index) => {
    const token = companies[index].token;
    if (result.status === "fulfilled") {
      if (result.value.success) jobs.push(...result.value.data);
      else errors.push({ token, reason: errorReason(result.value.error) });
    } else {
      const reason =
        result.reason instanceof Error ? result.reason.message : "Unknown error";
      errors.push({ token, reason });
    }
  });
  return { jobs, errors };
}

// Workplace strings seen across these ATSs → WORKPLACE_TYPES enum keys.
export function mapWorkplace(raw?: string | null): string | undefined {
  const v = (raw ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (!v) return undefined;
  if (v === "remote" || v === "fully" || v === "fullyremote") return "REMOTE";
  if (v === "hybrid") return "HYBRID";
  if (v === "onsite" || v === "none" || v === "office") return "ONSITE";
  return undefined;
}

// Minimal RSS helpers (the feeds here are flat and well-formed; no XML dep).
export function rssItems(xml: string): string[] {
  return xml.split(/<item>/).slice(1).map((chunk) => chunk.split("</item>")[0]);
}

export function rssTag(item: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const m = item.match(re);
  if (!m) return "";
  const raw = m[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : raw;
}

export function rssTags(item: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  return Array.from(item.matchAll(re), (m) => m[1].trim());
}

// RFC-822 pubDate → ISO, or undefined when unparseable.
export function toIsoDate(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// Cheap title prefilter: a target matches when the title shares at least
// min(2, target words) of its words. No targets means everything passes.
const STOPWORDS = new Set(["of", "and", "the", "a", "an", "for", "to", "in", "&", "-"]);
const words = (s: string) =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

export function titleMatchesAny(title: string, targetTitles: string[] = []): boolean {
  if (targetTitles.length === 0) return true;
  const have = new Set(words(title));
  return targetTitles.some((t) => {
    const want = words(t);
    return want.length > 0 && want.filter((w) => have.has(w)).length >= Math.min(2, want.length);
  });
}
