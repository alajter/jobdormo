// A gap that repeats across job matches, as grouped by scripts/summarize-gaps.ts.
export type GapCluster = {
  gap: string; // short name, e.g. "5+ years with a Product Manager title"
  advice: string; // one or two sentences: how to close or address it
  jobs: { id: string; company: string; title: string; track?: string | null }[];
};

export type GapReportView = {
  createdAt: Date;
  jobCount: number;
  clusters: GapCluster[];
};

export function parseGapClusters(data: string): GapCluster[] {
  try {
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.gap === "string" && Array.isArray(c.jobs))
      .map((c) => ({
        gap: c.gap,
        advice: typeof c.advice === "string" ? c.advice : "",
        // The model sometimes lists a job twice; keep the first.
        jobs: c.jobs.filter(
          (j: any, i: number, all: any[]) =>
            j && typeof j.id === "string" && all.findIndex((x) => x?.id === j.id) === i,
        ),
      }))
      .sort((a, b) => b.jobs.length - a.jobs.length);
  } catch {
    return [];
  }
}
