import type { JobDetails } from "../types";
import { titleMatchesAny } from "./boardFetch";

/**
 * Hard filters applied before ranking, so jobs the user can't take never
 * reach the AI.
 *
 * - requireTerms: keep a job only if its title, company or description
 *   mentions at least one term (e.g. "cyber", "security"). Ranking keywords
 *   only nudge a score; this is a gate.
 * - remoteOk: treat remote roles as in-location, unless the posting
 *   restricts remote work to another country or region. "Remote (US)" or
 *   "open to candidates elsewhere in the US" is not remote for someone
 *   in Israel.
 */

const haystack = (job: JobDetails) =>
  `${job.title}\n${job.company}\n${job.location}\n${job.description}`.toLowerCase();

export function matchesRequiredTerms(job: JobDetails, terms: string[]): boolean {
  const wanted = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return true;
  const text = haystack(job);
  return wanted.some((t) => text.includes(t));
}

export function isRemote(job: JobDetails): boolean {
  if (job.isRemote) return true;
  const where = `${job.location} ${job.workplaceType ?? ""}`.toLowerCase();
  return /\bremote\b|\banywhere\b|\bworldwide\b|\bdistributed\b/.test(where);
}

// Places that make a remote role open to someone in the user's region.
const OPEN_TO = /\b(israel|tel[- ]?aviv|ramat[- ]?gan|giv'?atayim|emea|europe|european|eu\b|worldwide|global(ly)?|anywhere|international)/i;

// Patterns that tie a remote role to somewhere else.
const RESTRICTED = [
  /remote\s*[-–(,:]?\s*\(?\s*(us|u\.s\.|usa|united states|canada|north america|uk|united kingdom|apac|latam|australia|india)\b/i,
  /\b(us|u\.s\.|usa|united states|canada|north america|uk|apac|latam)\s*[-–]?\s*(only|based|remote)\b/i,
  /\belsewhere in the (us|u\.s\.|united states|uk|states)\b/i,
  /\bmust (be|reside|live) (based |located )?in (the )?(us|u\.s\.|usa|united states|canada|uk|united kingdom)\b/i,
  /\b(authorized|authorised|eligible) to work in the (us|u\.s\.|united states|uk)\b/i,
];

// "Hyderabad (Remote)", "Remote - Poland": a remote role whose location names
// a place but no region open to the user.
function pinnedElsewhere(location: string): boolean {
  const rest = location
    .replace(/\b(remote|fully remote|work from home|wfh|hybrid|on-?site)\b/gi, "")
    .replace(/[()\[\],;:|/\\-]+/g, " ")
    .trim();
  return rest.length > 0 && !OPEN_TO.test(location);
}

export function isRemoteRestrictedElsewhere(job: JobDetails): boolean {
  if (pinnedElsewhere(job.location ?? "")) return true;
  const text = `${job.location}\n${job.description}`;
  if (!RESTRICTED.some((re) => re.test(text))) return false;
  // A posting that also opens the role to the user's region is still open.
  return !OPEN_TO.test(job.location);
}

/** True if the job should be kept under the remote rules. */
export function passesRemoteRule(job: JobDetails, remoteOk: boolean): boolean {
  if (!isRemote(job)) return true;
  if (!remoteOk) return true; // location gate decides as before
  return !isRemoteRestrictedElsewhere(job);
}

/**
 * Title gate. With strictTitles, a job must match a target title (same
 * word-overlap rule the boards use to prefilter); any excluded word in the
 * title drops it either way.
 */
export function passesTitleRule(
  job: Pick<JobDetails, "title">,
  cfg: { strictTitles?: boolean; targetTitles?: string[]; excludeTitleTerms?: string[] },
): boolean {
  const title = job.title.toLowerCase();
  const excluded = (cfg.excludeTitleTerms ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (excluded.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(title))) return false;
  if (!cfg.strictTitles) return true;
  return titleMatchesAny(job.title, cfg.targetTitles ?? []);
}
