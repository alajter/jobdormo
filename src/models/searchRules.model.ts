// The user's own search rules (Settings → Search rules): where they can work,
// how big a company they'll join, which roles they only take at a senior
// level, and the thresholds behind "apply / tailor / skip". Pure and
// client-safe; stored in the user settings JSON as `searchRules`.

export type SearchRules = {
  // Where the user lives and works from. Empty: no location rule.
  homeCity: string;
  // Cities close enough to commute to: "check the commute", not a reason to skip.
  nearbyCities: string[];
  // Largest company to consider, in employees. 0: no limit.
  maxCompanySize: number;
  // Role families taken only at a senior level (e.g. "customer success").
  seniorOnlyRoles: string[];
  // Title words that count as senior for those roles.
  seniorTitles: string[];
  // A tailored CV is ready to send at this ATS keyword match (%).
  atsTarget: number;
  // Jobs below this AI match are borderline; ten points lower, a skip.
  minMatch: number;
  // Postings older than this (days) are treated as probably filled.
  staleDays: number;
};

export const DEFAULT_SEARCH_RULES: SearchRules = {
  homeCity: "",
  nearbyCities: [],
  maxCompanySize: 0,
  seniorOnlyRoles: [],
  seniorTitles: ["vp", "vice president", "head", "director", "chief"],
  atsTarget: 75,
  minMatch: 60,
  staleDays: 60,
};

const words = (v: unknown, max = 20) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, max);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function normalizeSearchRules(input?: Partial<Record<keyof SearchRules, unknown>> | null): SearchRules {
  const d = DEFAULT_SEARCH_RULES;
  if (!input) return { ...d };
  return {
    homeCity: typeof input.homeCity === "string" ? input.homeCity.trim().slice(0, 80) : d.homeCity,
    nearbyCities: input.nearbyCities === undefined ? d.nearbyCities : words(input.nearbyCities, 30),
    maxCompanySize: num(input.maxCompanySize, 0, 10_000_000, d.maxCompanySize),
    seniorOnlyRoles: input.seniorOnlyRoles === undefined ? d.seniorOnlyRoles : words(input.seniorOnlyRoles),
    seniorTitles: input.seniorTitles === undefined ? d.seniorTitles : words(input.seniorTitles),
    atsTarget: num(input.atsTarget, 30, 100, d.atsTarget),
    minMatch: num(input.minMatch, 0, 100, d.minMatch),
    staleDays: num(input.staleDays, 7, 365, d.staleDays),
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]?");
const anyOf = (list: string[]) => (list.length ? new RegExp(`\\b(${list.map(escape).join("|")})\\b`, "i") : null);

/** The smallest headcount a size string allows ("1001-5000" → 1001, "10,001+" → 10001, "732" → 732). */
export function minHeadcount(size?: string | null): number | null {
  const m = (size ?? "").replace(/,/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function isTooBig(size: string | null | undefined, rules: SearchRules): boolean {
  if (!rules.maxCompanySize) return false;
  const n = minHeadcount(size);
  return n != null && n > rules.maxCompanySize;
}

export function isBelowSeniority(title: string, rules: SearchRules): boolean {
  const family = anyOf(rules.seniorOnlyRoles);
  const senior = anyOf(rules.seniorTitles);
  if (!family || !family.test(title)) return false;
  return !(senior && senior.test(title));
}

/** Office location against the home city: nothing, a soft "check it", or a hard "outside". */
export function locationCheck(
  location: string,
  workplace: string,
  rules: SearchRules,
): { reason: string; hard: boolean } | null {
  const home = rules.homeCity.trim();
  if (!home || !location || /remote/i.test(workplace)) return null;
  const homeRe = anyOf([home]);
  const near = anyOf(rules.nearbyCities);
  // A district or region name ("Tel Aviv District", "Greater London") isn't an address.
  if (homeRe?.test(location) && /\b(district|region|area|greater|metropolitan|county)\b/i.test(location) && !new RegExp(`${escape(home)}[^,]*,`, "i").test(location.replace(/\b(district|region|area)\b.*$/i, "")))
    return { reason: `"${location}" can mean anywhere around ${home}: check the office address.`, hard: false };
  if (homeRe?.test(location)) return null;
  if (near?.test(location)) return { reason: `Office in ${location.split(",")[0]}, next to ${home}: check the commute.`, hard: false };
  return { reason: `Office in ${location}, outside ${home}.`, hard: true };
}
