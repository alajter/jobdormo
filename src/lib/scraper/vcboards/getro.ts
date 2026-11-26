export interface GetroJob {
  id: string;
  title: string;
  url: string;
  locations: string[];
  workMode?: string;
  seniority?: string;
  company: string;
  stage?: string;
  headCount?: number;
  industryTags: string[];
  createdAt?: number;
}

// Getro boards are Next.js pages; the public search page (?q=) embeds its
// results in __NEXT_DATA__. Returns [] for a page without them.
export function parseGetroSearch(html: string): GetroJob[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const found = data?.props?.pageProps?.initialState?.jobs?.found;
  if (!Array.isArray(found)) return [];
  return found
    .filter((j: any) => j && typeof j.title === "string" && j.organization?.name)
    .map((j: any) => ({
      id: String(j.id ?? j.slug ?? j.url),
      title: j.title.trim(),
      url: typeof j.url === "string" ? j.url : "",
      locations: Array.isArray(j.locations) ? j.locations : [],
      workMode: j.workMode ?? undefined,
      seniority: j.seniority ?? undefined,
      company: String(j.organization.name).trim(),
      stage: j.organization.stage ?? undefined,
      headCount: typeof j.organization.headCount === "number" ? j.organization.headCount : undefined,
      industryTags: Array.isArray(j.organization.industryTags) ? j.organization.industryTags.slice(0, 8) : [],
      createdAt: typeof j.createdAt === "number" ? j.createdAt : undefined,
    }));
}

// Late-stage funding rounds and public or acquired companies count as big.
const BIG_STAGES = new Set([
  "series_d", "series_e", "series_f", "series_g", "series_h", "late_stage",
  "growth", "ipo", "public", "post_ipo", "acquired", "private_equity",
]);
// Getro headCount is a bucket index; observed: 3 ≈ 51-200, 4 ≈ 201-500,
// 5 ≈ 501-1000 and up.
const BIG_HEADCOUNT = 5;

export function isBigCompany(job: Pick<GetroJob, "stage" | "headCount">): boolean {
  if (job.stage && BIG_STAGES.has(job.stage.toLowerCase())) return true;
  return typeof job.headCount === "number" && job.headCount >= BIG_HEADCOUNT;
}

// Getro job pages carry no description, so the matcher gets the structured
// facts instead, stated as facts.
export function describeGetroJob(job: GetroJob, boardName: string): string {
  const parts = [
    `<p>${esc(job.title)} at ${esc(job.company)}.</p>`,
    job.stage ? `<p>Company stage: ${esc(job.stage.replace(/_/g, " "))}.</p>` : "",
    job.locations.length ? `<p>Locations: ${esc(job.locations.join("; "))}.</p>` : "",
    job.workMode ? `<p>Work mode: ${esc(job.workMode.replace(/_/g, " "))}.</p>` : "",
    job.seniority ? `<p>Seniority: ${esc(job.seniority)}.</p>` : "",
    job.industryTags.length ? `<p>Company focus: ${esc(job.industryTags.join(", "))}.</p>` : "",
    `<p>Listed on the ${esc(boardName)} job board. The full description is on the posting link.</p>`,
  ];
  return parts.filter(Boolean).join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
