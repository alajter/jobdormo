"use server";

import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";
import { ATS_TOKEN_REGEX } from "@/lib/scraper/utils";
import {
  extractComeetToken,
  extractTeamtailorToken,
  extractWorkableToken,
} from "@/lib/scraper/ats/boardTokens";
import greenhouseSeed from "@/lib/scraper/greenhouse/companies.json";
import leverSeed from "@/lib/scraper/lever/companies.json";
import ashbySeed from "@/lib/scraper/ashby/companies.json";
import vcBoardsSeed from "@/lib/scraper/vcboards/companies.json";
import { VC_BOARDS } from "@/lib/scraper/vcboards/boards";
import comeetSeed from "@/lib/scraper/comeet/companies.json";
import teamtailorSeed from "@/lib/scraper/teamtailor/companies.json";
import workableSeed from "@/lib/scraper/workable/companies.json";
import remoteBoardsSeed from "@/lib/scraper/remoteboards/companies.json";
import { REMOTE_BOARDS } from "@/lib/scraper/remoteboards/boards";
import { comeetBoardUrl, parseComeetPage } from "@/lib/scraper/comeet";
import { workableWidgetUrl } from "@/lib/scraper/workable";
import { teamtailorBoardUrl } from "@/lib/scraper/teamtailor";
import type { JobBoard, LeverHost } from "@/models/automation.model";

// `host` is present (optional) on Lever entries only; Greenhouse entries omit it.
type SeedCompany = { name: string; token: string; host?: LeverHost };

const SEEDS: Record<string, SeedCompany[]> = {
  greenhouse: greenhouseSeed,
  lever: leverSeed as SeedCompany[],
  ashby: ashbySeed as SeedCompany[],
  vcboards: vcBoardsSeed as SeedCompany[],
  comeet: comeetSeed as SeedCompany[],
  teamtailor: teamtailorSeed as SeedCompany[],
  workable: workableSeed as SeedCompany[],
  remoteboards: remoteBoardsSeed as SeedCompany[],
};

type ResolveResult =
  | { success: true; name: string; token: string; host?: LeverHost }
  | { success: false; message: string };

// Typeahead over the seeded companies.json (server-side filter, paginated).
// An empty query browses the full list (alphabetical); `offset` drives the
// infinite-scroll load-more. Returns a page plus whether more remain.
export async function searchAtsCompanies(
  provider: JobBoard,
  query: string,
  offset = 0,
): Promise<{ companies: SeedCompany[]; hasMore: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { companies: [], hasMore: false };

  const seed = SEEDS[provider] ?? [];
  const q = query.trim().toLowerCase();
  const matches =
    q.length < 1
      ? seed
      : seed.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.token.toLowerCase().includes(q),
        );

  const companies = matches.slice(
    offset,
    offset + APP_CONSTANTS.ATS_COMPANY_PAGE_SIZE,
  );
  return { companies, hasMore: offset + companies.length < matches.length };
}

// Total number of companies in the seeded directory (for a browse hint).
export async function getAtsCompanyCount(provider: JobBoard): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  return (SEEDS[provider] ?? []).length;
}

// Validate a token or board URL; returns the display company name (and, for
// Lever, the resolved host). Dispatches per provider.
export async function resolveAtsBoard(
  provider: JobBoard,
  input: string,
): Promise<ResolveResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  if (provider === "greenhouse") return resolveGreenhouse(input);
  if (provider === "lever") return resolveLever(input);
  if (provider === "ashby") return resolveAshby(input);
  if (provider === "vcboards") {
    const board = VC_BOARDS[input.trim().toLowerCase()];
    return board
      ? { success: true, name: board.name, token: board.token }
      : { success: false, message: "Only the listed VC boards are supported" };
  }
  if (provider === "remoteboards") {
    const board = REMOTE_BOARDS[input.trim().toLowerCase()];
    return board
      ? { success: true, name: board.name, token: board.token }
      : { success: false, message: "Only the listed remote boards are supported" };
  }
  if (provider === "comeet") return resolveComeet(input);
  if (provider === "teamtailor") return resolveTeamtailor(input);
  if (provider === "workable") return resolveWorkable(input);
  return { success: false, message: "Unsupported provider" };
}

const ATS_FETCH_INIT = {
  headers: { "User-Agent": APP_CONSTANTS.ATS_USER_AGENT },
};

// Comeet: a board is "{slug}/{uid}", from a comeet.com/jobs/{slug}/{uid}[/...]
// link or typed as-is. Validated by fetching the hosted careers page (an
// unknown board redirects to comeet.com's home page); the name comes from the
// page's COMPANY_DATA.

async function resolveComeet(input: string): Promise<ResolveResult> {
  const token = extractComeetToken(input);
  if (!token) {
    return {
      success: false,
      message: "Paste a comeet.com/jobs/{company}/{id} link",
    };
  }
  try {
    const res = await fetch(comeetBoardUrl(token), ATS_FETCH_INIT);
    const html = res.ok ? await res.text() : "";
    const parsed = res.url.includes("/jobs/") ? parseComeetPage(html) : null;
    if (!parsed) {
      return { success: false, message: `No Comeet board found for '${token}'` };
    }
    const seeded = (comeetSeed as SeedCompany[]).find(
      (c) => c.token.toLowerCase() === token.toLowerCase(),
    );
    const name = seeded?.name ?? parsed.companyName ?? token.split("/")[0];
    return { success: true, name, token: seeded?.token ?? token };
  } catch {
    return { success: false, message: "Could not reach Comeet" };
  }
}

// Teamtailor: the token is the {slug} of {slug}.teamtailor.com. A custom
// career-site domain (careers.acme.com) is tried as the slug "acme"; only
// teamtailor.com is ever fetched.

async function resolveTeamtailor(input: string): Promise<ResolveResult> {
  const token = extractTeamtailorToken(input);
  if (!token) {
    return {
      success: false,
      message: "Paste a {company}.teamtailor.com link or the company's slug",
    };
  }
  try {
    const res = await fetch(`${teamtailorBoardUrl(token)}.rss`, ATS_FETCH_INIT);
    const xml = res.ok ? await res.text() : "";
    if (!xml.includes("<rss")) {
      return { success: false, message: `No Teamtailor site found for '${token}'` };
    }
    const channelTitle = xml.match(/<channel>\s*<title>([^<]*)<\/title>/)?.[1]?.trim();
    const seeded = (teamtailorSeed as SeedCompany[]).find((c) => c.token === token);
    return {
      success: true,
      name: seeded?.name ?? channelTitle ?? humanizeToken(token),
      token,
    };
  } catch {
    return { success: false, message: "Could not reach Teamtailor" };
  }
}

// Workable: the token is the account slug from apply.workable.com/{slug} (or
// {slug}.workable.com, or typed as-is). Validated with the widget API, which
// 404s for unknown accounts and carries the account name.

async function resolveWorkable(input: string): Promise<ResolveResult> {
  const token = extractWorkableToken(input);
  if (!token) {
    return {
      success: false,
      message: "Paste an apply.workable.com/{company} link or the account name",
    };
  }
  try {
    const res = await fetch(workableWidgetUrl(token, false), ATS_FETCH_INIT);
    if (res.status === 404) {
      res.body?.cancel();
      return { success: false, message: `No Workable account found for '${token}'` };
    }
    if (!res.ok) {
      res.body?.cancel();
      return { success: false, message: `Could not validate board (${res.status})` };
    }
    const data: { name?: string } = await res.json();
    const seeded = (workableSeed as SeedCompany[]).find((c) => c.token === token);
    return {
      success: true,
      name: seeded?.name ?? data.name?.trim() ?? humanizeToken(token),
      token,
    };
  } catch {
    return { success: false, message: "Could not reach Workable" };
  }
}

// Greenhouse: extract token from a board URL or bare token; validate via
// /boards/{token}; return the API's official name.
function extractGreenhouseToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(
    /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i,
  );
  if (urlMatch) return urlMatch[1].toLowerCase();

  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    const token = trimmed.toLowerCase();
    return ATS_TOKEN_REGEX.test(token) ? token : null;
  }

  return null;
}

async function resolveGreenhouse(input: string): Promise<ResolveResult> {
  const token = extractGreenhouseToken(input);
  if (!token) {
    return {
      success: false,
      message: "Paste a boards.greenhouse.io link or a board token",
    };
  }

  try {
    const response = await fetch(
      `${APP_CONSTANTS.GREENHOUSE_BASE_URL}/${encodeURIComponent(token)}`,
    );

    if (response.status === 404) {
      return {
        success: false,
        message: `No Greenhouse board found for '${token}'`,
      };
    }
    if (!response.ok) {
      return {
        success: false,
        message: `Could not validate board (${response.status})`,
      };
    }

    const data: { name?: string } = await response.json();
    const name = data.name?.trim();
    if (!name) {
      return { success: false, message: "Board has no company name" };
    }

    return { success: true, name, token };
  } catch {
    return { success: false, message: "Could not reach Greenhouse" };
  }
}

// Lever: extract token (+ explicit EU host) from a jobs.lever.co /
// jobs.eu.lever.co URL or bare token; validate by probing the postings
// endpoint; resolve the display name from the seed or a humanized token.
function extractLeverToken(
  input: string,
): { token: string; host?: LeverHost } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/jobs\.(eu\.)?lever\.co\/([a-z0-9_-]+)/i);
  if (urlMatch) {
    return {
      token: urlMatch[2].toLowerCase(),
      host: urlMatch[1] ? "eu" : "default",
    };
  }

  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    return { token: trimmed.toLowerCase() };
  }

  return null;
}

function humanizeToken(token: string): string {
  return token
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function probeLeverBoard(
  token: string,
  host: LeverHost,
): Promise<boolean> {
  const base =
    host === "eu"
      ? APP_CONSTANTS.LEVER_EU_BASE_URL
      : APP_CONSTANTS.LEVER_BASE_URL;
  const res = await fetch(
    `${base}/${encodeURIComponent(token)}?mode=json&limit=1`,
  );
  return res.ok;
}

async function resolveLever(input: string): Promise<ResolveResult> {
  const extracted = extractLeverToken(input);
  if (!extracted) {
    return {
      success: false,
      message: "Paste a jobs.lever.co link or a token",
    };
  }

  const { token } = extracted;
  // Defense-in-depth: reject a malformed token before any fetch.
  if (!ATS_TOKEN_REGEX.test(token)) {
    return { success: false, message: `Invalid Lever token '${token}'` };
  }

  try {
    let host: LeverHost;
    if (extracted.host === "eu") {
      if (!(await probeLeverBoard(token, "eu"))) {
        return { success: false, message: `No Lever board found for '${token}'` };
      }
      host = "eu";
    } else {
      // Bare token or default-host URL: probe default first, fall back to EU.
      if (await probeLeverBoard(token, "default")) {
        host = "default";
      } else if (await probeLeverBoard(token, "eu")) {
        host = "eu";
      } else {
        return { success: false, message: `No Lever board found for '${token}'` };
      }
    }

    const seeded = (leverSeed as SeedCompany[]).find((c) => c.token === token);
    const name = seeded?.name ?? humanizeToken(token);
    return { success: true, name, token, host };
  } catch {
    return { success: false, message: "Could not reach Lever" };
  }
}

// Ashby: extract the token from a jobs.ashbyhq.com URL (board or deep posting
// link) or a bare token; validate with a single call — an unknown board 404s,
// so there is nothing to probe. The payload carries no company name, so the
// display name comes from the seed or a humanized token, as with Lever.
function extractAshbyToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();

  if (!trimmed.includes("/") && !trimmed.includes(".")) {
    return trimmed.toLowerCase();
  }

  return null;
}

async function resolveAshby(input: string): Promise<ResolveResult> {
  const token = extractAshbyToken(input);
  if (!token) {
    return {
      success: false,
      message: "Paste a jobs.ashbyhq.com link or a token",
    };
  }

  // Defense-in-depth: reject a malformed token before any fetch.
  if (!ATS_TOKEN_REGEX.test(token)) {
    return { success: false, message: `Invalid Ashby token '${token}'` };
  }

  try {
    const res = await fetch(
      `${APP_CONSTANTS.ASHBY_BASE_URL}/${encodeURIComponent(token)}`,
    );
    res.body?.cancel(); // status is all we need; skip the full board payload

    if (res.status === 404) {
      return { success: false, message: `No Ashby board found for '${token}'` };
    }
    if (!res.ok) {
      return {
        success: false,
        message: `Could not validate board (${res.status})`,
      };
    }

    const seeded = (ashbySeed as SeedCompany[]).find((c) => c.token === token);
    return { success: true, name: seeded?.name ?? humanizeToken(token), token };
  } catch {
    return { success: false, message: "Could not reach Ashby" };
  }
}
