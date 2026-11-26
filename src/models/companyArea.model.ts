// Company areas: a fixed list so filters stay clean. A company can have
// several (e.g. an AI security startup is both "security" and "ai").
export const COMPANY_AREAS = {
  security: "Security",
  ai: "AI",
  devtools: "DevTools",
  data: "Data",
  fintech: "Fintech",
  healthtech: "Healthtech",
  martech: "Sales & Marketing",
  hrtech: "HR tech",
  commerce: "Commerce",
  other: "Other",
} as const;

export type CompanyArea = keyof typeof COMPANY_AREAS;

export const COMPANY_AREA_CODES = Object.keys(COMPANY_AREAS) as CompanyArea[];

export const getCompanyAreaLabel = (code: string): string =>
  (COMPANY_AREAS as Record<string, string>)[code] ?? code;

/** Keeps only known area codes, deduped, in list order. */
export const normalizeCompanyAreas = (input: unknown): CompanyArea[] =>
  Array.isArray(input)
    ? COMPANY_AREA_CODES.filter((code) => input.includes(code))
    : [];
