"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "./shared";
import { parseGapClusters, type GapReportView } from "@/models/gapReport.model";
import { changeJobStatus } from "@/lib/jobs/timeline";
import { defaultUserSettings, type UserSettingsData } from "@/models/userSettings.model";

// Latest "what you're missing" report, with jobs that are no longer on the
// board (or no longer open) dropped so links never point at nothing.
export const getLatestGapReport = async (): Promise<GapReportView | null> => {
  try {
    const user = await requireUser();
    const report = await prisma.gapReport.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!report) return null;
    const clusters = parseGapClusters(report.data);
    const ids = [...new Set(clusters.flatMap((c) => c.jobs.map((j) => j.id)))];
    const live = new Map(
      (
        await prisma.job.findMany({
          where: {
            userId: user.id,
            id: { in: ids },
            Status: { value: { in: ["new", "draft", "applied", "interview"] } },
          },
          select: { id: true, track: true },
        })
      ).map((j) => [j.id, j.track] as const),
    );
    return {
      createdAt: report.createdAt,
      jobCount: report.jobCount,
      clusters: clusters
        .map((c) => ({
          ...c,
          jobs: c.jobs
            .filter((j) => live.has(j.id))
            .map((j) => ({ ...j, track: live.get(j.id) ?? null })),
        }))
        .filter((c) => c.jobs.length > 0)
        .sort((a, b) => b.jobs.length - a.jobs.length),
    };
  } catch (error) {
    handleError(error, "Failed to fetch gap report. ");
    return null;
  }
};

// Statuses a "Not for me" may archive: never anything already applied to.
const ARCHIVABLE = ["new", "draft"];

/**
 * "Not for me" on a gap: archives the user's own not-yet-applied jobs that
 * have it, notes why on each, and saves the gap as a deal-breaker that the
 * daily web-search agent skips. It never archives anything beyond the jobs
 * the user confirmed.
 */
export const archiveJobsForGap = async (
  gap: string,
  jobIds: string[],
): Promise<{ success: boolean; archived: number; message?: string }> => {
  try {
    const user = await requireUser();
    const name = gap.trim().slice(0, 200);
    if (!name) return { success: false, archived: 0, message: "No gap given." };

    const archived = await prisma.jobStatus.findFirst({ where: { value: "archived" } });
    if (!archived) return { success: false, archived: 0, message: "No Archived status." };

    const jobs = await prisma.job.findMany({
      where: {
        userId: user.id,
        id: { in: jobIds.slice(0, 500) },
        applied: false,
        Status: { value: { in: ARCHIVABLE } },
      },
      select: { id: true },
    });
    for (const j of jobs) {
      await changeJobStatus({ jobId: j.id, userId: user.id, statusId: archived.id });
      await prisma.note.create({
        data: { jobId: j.id, userId: user.id, content: `Archived: not for me (missing "${name}").` },
      });
    }

    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const current: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
    const dealbreakers = [...new Set([...(current.jobSearch?.dealbreakers ?? []), name])];
    const next = { ...current, jobSearch: { ...current.jobSearch, dealbreakers } };
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { settings: JSON.stringify(next) },
      create: { userId: user.id, settings: JSON.stringify(next) },
    });

    return { success: true, archived: jobs.length };
  } catch (error) {
    handleError(error, "Failed to archive jobs. ");
    return { success: false, archived: 0, message: "Something went wrong." };
  }
};
