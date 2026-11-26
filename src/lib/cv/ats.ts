import "server-only";
import { readFileSync } from "fs";
import prisma from "@/lib/db";
import { userModel } from "@/lib/people/voice";
import { guessTrack } from "@/models/cvTrack.model";
import { keywordCoverage } from "./cvEdits";
import { ATS_TARGET, postingKeywords } from "./tailor";
import type { CvIssue } from "./review";
import { cvPath, loadCvTracks, readTrackCvHtml } from "./tracks";

// ATS keyword match for a job: the posting's keywords (extracted once and
// stored) found in the generic CV for the job's track, and in its tailored
// CV when there is one. Deterministic after the one extraction.
export async function scoreJobAts(
  userId: string,
  jobId: string,
  opts: { refreshKeywords?: boolean } = {},
): Promise<{ base: number | null; tailored: number | null; keywords: string[] } | null> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { JobTitle: true, Company: true },
  });
  if (!job) return null;
  const tracks = loadCvTracks();
  if (!tracks.length) return null;

  let keywords: string[] = [];
  if (!opts.refreshKeywords && job.atsKeywords) {
    try {
      const k = JSON.parse(job.atsKeywords);
      if (Array.isArray(k)) keywords = k.filter((x: unknown): x is string => typeof x === "string");
    } catch {
      keywords = [];
    }
  }
  if (!keywords.length) {
    const posting = job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
    if (posting.length < 200) return null; // too little text to judge
    keywords = await postingKeywords(await userModel(userId), job.JobTitle.label, posting);
  }
  if (!keywords.length) return null;

  const trackId =
    (job.track && tracks.some((t) => t.id === job.track) ? job.track : null) ??
    guessTrack(job.JobTitle.label, job.Company.areas ?? [], tracks.map((t) => t.id)) ??
    tracks[0].id;
  const baseHtml = readTrackCvHtml(trackId);
  const base = baseHtml ? keywordCoverage(baseHtml, keywords).score : null;

  let tailored: number | null = null;
  const tailoredPath = job.tailoredCv ? cvPath(job.tailoredCv) : null;
  if (tailoredPath) {
    try {
      tailored = keywordCoverage(readFileSync(tailoredPath, "utf8"), keywords).score;
    } catch {
      tailored = null;
    }
  }

  await prisma.job.updateMany({
    where: { id: job.id, userId },
    data: { atsKeywords: JSON.stringify(keywords), atsBase: base, atsTailored: tailored, atsCheckedAt: new Date() },
  });
  return { base, tailored, keywords };
}

const parseKeywords = (raw: string | null): string[] => {
  try {
    const k = raw ? JSON.parse(raw) : [];
    return Array.isArray(k) ? k.filter((x: unknown): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** Scores and the keywords the tailored CV still misses, from stored data (no AI). */
export async function tailorStateFor(userId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { tailoredCv: true, atsKeywords: true, atsBase: true, atsTailored: true, cvReview: true, appliedCv: true, appliedAts: true },
  });
  if (!job) return null;
  let review: CvIssue[] = [];
  try {
    review = job.cvReview ? JSON.parse(job.cvReview) : [];
  } catch {
    review = [];
  }
  const keywords = parseKeywords(job.atsKeywords);
  let missing: string[] = [];
  const p = job.tailoredCv ? cvPath(job.tailoredCv) : null;
  if (p && keywords.length) {
    try {
      missing = keywordCoverage(readFileSync(p, "utf8"), keywords).missing;
    } catch {
      missing = [];
    }
  }
  return {
    hasTailored: !!job.tailoredCv,
    base: job.atsBase,
    tailored: job.atsTailored,
    missing,
    target: ATS_TARGET,
    review,
    appliedCv: job.appliedCv,
    appliedAts: job.appliedAts,
  };
}

/** Open jobs (new or applied) whose CV isn't ready: no tailored CV, or below the target. */
export async function cvsToFinishFor(userId: string) {
  const jobs = await prisma.job.findMany({
    where: {
      userId,
      Status: { value: { in: ["new", "applied", "interview"] } },
      OR: [{ atsTailored: null }, { atsTailored: { lt: ATS_TARGET } }, { cvReview: { contains: '"severity":"high"' } }],
      atsKeywords: { not: null },
    },
    select: {
      id: true,
      atsBase: true,
      atsTailored: true,
      atsKeywords: true,
      tailoredCv: true,
      cvReview: true,
      matchScore: true,
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
    orderBy: [{ matchScore: { sort: "desc", nulls: "last" } }],
    take: 15,
  });
  return jobs.map((j) => {
    let missing = 0;
    const p = j.tailoredCv ? cvPath(j.tailoredCv) : null;
    if (p) {
      try {
        missing = keywordCoverage(readFileSync(p, "utf8"), parseKeywords(j.atsKeywords)).missing.length;
      } catch {
        missing = 0;
      }
    }
    const issues = (() => {
      try {
        return (j.cvReview ? (JSON.parse(j.cvReview) as CvIssue[]) : []).filter((i) => i.severity === "high").length;
      } catch {
        return 0;
      }
    })();
    return { id: j.id, title: j.JobTitle.label, company: j.Company.label, base: j.atsBase, tailored: j.atsTailored, missing, issues };
  });
}
