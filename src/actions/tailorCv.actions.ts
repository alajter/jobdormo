"use server";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { tailorCvForJob, type TailorFact, type TailorResult } from "@/lib/cv/tailor";
import { cvsToFinishFor, scoreJobAts, tailorStateFor } from "@/lib/cv/ats";
import { applyCvFix, reviewJobCv, type CvIssue } from "@/lib/cv/review";

/**
 * Makes (or remakes) the CV for one job. `facts` are the missing keywords the
 * user says they do have, and how; they're saved for later CVs too.
 */
export const tailorCv = async (
  jobId: string,
  input: { instructions?: string; facts?: TailorFact[] } = {},
): Promise<{ success: boolean; result?: Omit<TailorResult, "pdf">; message?: string }> => {
  try {
    const user = await requireUser();
    const { pdf: _pdf, ...result } = await tailorCvForJob(user.id, jobId, input);
    return { success: true, result };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't tailor the CV." };
  }
};

export type TailorState = {
  hasTailored: boolean;
  base: number | null;
  tailored: number | null;
  missing: string[];
  target: number;
  review: CvIssue[];
  appliedCv?: string | null;
  appliedAts?: number | null;
};

/** The job's current ATS state: scores and the keywords its tailored CV still misses. */
export const getTailorState = async (jobId: string): Promise<TailorState | null> => {
  try {
    const user = await requireUser();
    return await tailorStateFor(user.id, jobId);
  } catch {
    return null;
  }
};

/** Jobs whose CV isn't ready to send yet (no tailored CV, or below the target). */
export const getCvsToFinish = async (): Promise<
  { id: string; title: string; company: string; base: number | null; tailored: number | null; missing: number; issues: number }[]
> => {
  try {
    const user = await requireUser();
    return await cvsToFinishFor(user.id);
  } catch {
    return [];
  }
};

/** Re-runs the fact-check on the job's tailored CV. */
export const reviewCv = async (jobId: string): Promise<{ success: boolean; review?: CvIssue[]; message?: string }> => {
  try {
    const user = await requireUser();
    const review = await reviewJobCv(user.id, jobId);
    if (!review) return { success: false, message: "This job has no tailored CV yet." };
    // The CV may have been edited since the last score: recount (no AI call).
    await scoreJobAts(user.id, jobId);
    return { success: true, review };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't review the CV." };
  }
};

/** Applies one review issue's fix (or removes the quoted text) and re-renders the PDF. */
export const fixCvIssue = async (
  jobId: string,
  issue: { quote: string; fix: string | null },
): Promise<{ success: boolean; message?: string }> => {
  try {
    const user = await requireUser();
    const ok = await applyCvFix(user.id, jobId, issue);
    if (!ok) return { success: false, message: "Couldn't find that text in the CV; edit it by hand." };
    // A fix can add or drop a keyword: recount the ATS match (no AI call).
    await scoreJobAts(user.id, jobId);
    return { success: true };
  } catch {
    return { success: false, message: "Couldn't apply the fix." };
  }
};

/** Scores the job's ATS keyword match now (one AI call the first time, then deterministic). */
export const checkAts = async (
  jobId: string,
): Promise<{ success: boolean; base?: number | null; tailored?: number | null; message?: string }> => {
  try {
    const user = await requireUser();
    const r = await scoreJobAts(user.id, jobId);
    if (!r) return { success: false, message: "Not enough posting text to score. Add the job description first." };
    return { success: true, base: r.base, tailored: r.tailored };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't check the ATS match." };
  }
};

/** Corrects which CV went out with the application ("tailored" or "generic"). */
export const setAppliedCv = async (jobId: string, cv: "tailored" | "generic"): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    if (cv !== "tailored" && cv !== "generic") return { success: false };
    const job = await prisma.job.findFirst({ where: { id: jobId, userId: user.id }, select: { atsBase: true, atsTailored: true, tailoredCv: true } });
    if (!job || (cv === "tailored" && !job.tailoredCv)) return { success: false };
    await prisma.job.updateMany({
      where: { id: jobId, userId: user.id },
      data: { appliedCv: cv, appliedAts: cv === "tailored" ? job.atsTailored : job.atsBase },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
};
