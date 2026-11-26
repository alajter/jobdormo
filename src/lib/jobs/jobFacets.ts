import { JOB_STATUS_VALUES } from "@/lib/constants";
import { JOB_TYPES, JobFacets, WORKPLACE_TYPES } from "@/models/job.model";
import { COMPANY_AREA_CODES } from "@/models/companyArea.model";
import { TRACK_ID_REGEX } from "@/models/cvTrack.model";
import { OUTREACH_STATUS_CODES } from "@/models/outreach.model";

// Reach-out filter codes: the statuses plus "none" (not contacted).
export const OUTREACH_FILTER_CODES = ["none", ...OUTREACH_STATUS_CODES] as string[];

// "Open": every status from first find to an offer still on the table.
export const OPEN_JOB_STATUSES = ["new", "draft", "applied", "interview", "offer"] as const;

// The three views on Jobs (see design/JOBDORMO_DESIGN.md): each is a
// status filter, so it shows in the URL and works with every other filter.
export const JOB_VIEWS = [
  { id: "review", label: "Review", statuses: ["new", "draft"] },
  { id: "pursuing", label: "Pursuing", statuses: ["applied", "interview", "offer"] },
  {
    id: "closed",
    label: "Closed",
    statuses: ["offer-accepted", "offer-declined", "rejected", "expired", "archived", "withdrawn"],
  },
] as const;

export const jobViewFor = (statuses: string[]): string | null => {
  const key = [...statuses].sort().join(",");
  if (!key) return "all";
  return JOB_VIEWS.find((v) => [...v.statuses].sort().join(",") === key)?.id ?? null;
};

// Minimum match score options offered in the filter (0 = any).
export const MIN_SCORE_OPTIONS = [50, 60, 70] as const;

export const EMPTY_JOB_FACETS: JobFacets = {
  statuses: [],
  acceptedDiscovered: false,
  jobTypes: [],
  workplaces: [],
  includeDismissed: false,
  areas: [],
  minScore: 0,
  tracks: [],
  outreach: [],
};

const PARAM = {
  statuses: "status",
  acceptedDiscovered: "accepted",
  jobTypes: "type",
  workplaces: "workplace",
  includeDismissed: "dismissed",
  areas: "area",
  minScore: "score",
  tracks: "track",
  outreach: "reachout",
} as const;

const JOB_TYPE_CODES = Object.keys(JOB_TYPES);
const WORKPLACE_CODES = Object.keys(WORKPLACE_TYPES);

// Filtering the whitelist (not the input) dedupes and fixes the order.
const pick = (values: readonly string[] | undefined, allowed: string[]) =>
  allowed.filter((value) => values?.includes(value));

export function normalizeJobFacets(
  input?: Partial<JobFacets> | null,
): JobFacets {
  return {
    statuses: pick(input?.statuses, JOB_STATUS_VALUES),
    acceptedDiscovered: input?.acceptedDiscovered === true,
    jobTypes: pick(input?.jobTypes, JOB_TYPE_CODES),
    workplaces: pick(input?.workplaces, WORKPLACE_CODES),
    includeDismissed: input?.includeDismissed === true,
    areas: pick(input?.areas, COMPANY_AREA_CODES),
    minScore: (MIN_SCORE_OPTIONS as readonly number[]).includes(Number(input?.minScore))
      ? Number(input?.minScore)
      : 0,
    // Track ids come from the user's tracks.json, so validate shape only.
    tracks: [...new Set((input?.tracks ?? []).filter((t) => TRACK_ID_REGEX.test(t)))].slice(0, 20),
    outreach: pick(input?.outreach, OUTREACH_FILTER_CODES),
  };
}

const readList = (params: URLSearchParams, key: string) =>
  params.get(key)?.split(",") ?? [];

export function parseJobFacets(params: URLSearchParams): JobFacets {
  return normalizeJobFacets({
    statuses: readList(params, PARAM.statuses),
    acceptedDiscovered: params.get(PARAM.acceptedDiscovered) === "1",
    jobTypes: readList(params, PARAM.jobTypes),
    workplaces: readList(params, PARAM.workplaces),
    includeDismissed: params.get(PARAM.includeDismissed) === "1",
    areas: readList(params, PARAM.areas),
    minScore: Number(params.get(PARAM.minScore) ?? 0),
    tracks: readList(params, PARAM.tracks),
    outreach: readList(params, PARAM.outreach),
  });
}

export function writeJobFacets(
  params: URLSearchParams,
  facets: JobFacets,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const setList = (key: string, values: string[]) =>
    values.length ? next.set(key, values.join(",")) : next.delete(key);
  const setFlag = (key: string, on: boolean) =>
    on ? next.set(key, "1") : next.delete(key);

  setList(PARAM.statuses, facets.statuses);
  setFlag(PARAM.acceptedDiscovered, facets.acceptedDiscovered);
  setList(PARAM.jobTypes, facets.jobTypes);
  setList(PARAM.workplaces, facets.workplaces);
  setFlag(PARAM.includeDismissed, facets.includeDismissed);
  setList(PARAM.areas, facets.areas);
  setList(PARAM.tracks, facets.tracks);
  setList(PARAM.outreach, facets.outreach);
  if (facets.minScore) next.set(PARAM.minScore, String(facets.minScore));
  else next.delete(PARAM.minScore);
  return next;
}

export const countJobFacets = (facets: JobFacets) =>
  facets.statuses.length +
  facets.jobTypes.length +
  facets.workplaces.length +
  Number(facets.acceptedDiscovered) +
  Number(facets.includeDismissed) +
  facets.areas.length +
  facets.tracks.length +
  facets.outreach.length +
  Number(facets.minScore > 0);

export const hasJobFacets = (facets: JobFacets) => countJobFacets(facets) > 0;
