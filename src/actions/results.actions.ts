"use server";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { summarizeResults, type ResultsSummary } from "@/lib/results";
import { getSearchRulesFor } from "@/lib/search/rules.server";

const PURSUED = ["applied", "interview", "offer", "offer-accepted", "offer-declined", "rejected", "withdrawn"];

/** Everything the owner applied to, plus messages and posts, summarized for Results. */
export const getResults = async (): Promise<ResultsSummary | null> => {
  try {
    const user = await requireUser();
    const [jobs, activity, posts] = await Promise.all([
      prisma.job.findMany({
        where: {
          userId: user.id,
          OR: [{ applied: true }, { appliedDate: { not: null } }, { Status: { value: { in: PURSUED } } }],
        },
        select: {
          id: true,
          appliedDate: true,
          outreachStatus: true,
          atsTailored: true,
          tailoredCv: true,
          appliedCv: true,
          appliedAts: true,
          followUpOff: true,
          Status: { select: { value: true } },
          JobSource: { select: { label: true } },
          JobTitle: { select: { label: true } },
          Company: { select: { label: true } },
          stages: { select: { occurredAt: true, createdAt: true, StageType: { select: { Status: { select: { value: true } } } } } },
        },
      }),
      prisma.contactActivity.groupBy({ by: ["kind"], where: { userId: user.id }, _count: { _all: true } }),
      prisma.linkedinPost.findMany({
        where: { userId: user.id, status: "posted" },
        select: { impressions: true, reactions: true, comments: true },
      }),
    ]);
    const kind = (k: string) => activity.find((a) => a.kind === k)?._count._all ?? 0;
    const { atsTarget } = await getSearchRulesFor(user.id);
    return summarizeResults({
      atsTarget,
      apps: jobs
        // A job archived before applying was never an application.
        .filter((j) => j.appliedDate || j.Status.value !== "archived")
        .map((j) => ({
          id: j.id,
          company: j.Company.label,
          title: j.JobTitle.label,
          status: j.Status.value,
          appliedAt: j.appliedDate,
          outreach: j.outreachStatus,
          source: j.JobSource?.label ?? null,
          hasTailored: !!j.tailoredCv,
          tailoredAts: j.atsTailored,
          sentCv: j.appliedCv,
          sentAts: j.appliedAts,
          followUpOff: j.followUpOff,
          stages: j.stages.map((s) => ({ status: s.StageType.Status.value, at: s.occurredAt ?? s.createdAt })),
        })),
      network: { sent: kind("sent"), replies: kind("reply"), intros: kind("intro"), calls: kind("call") },
      posts: {
        published: posts.length,
        impressions: posts.reduce((a, p) => a + (p.impressions ?? 0), 0),
        reactions: posts.reduce((a, p) => a + (p.reactions ?? 0), 0),
        comments: posts.reduce((a, p) => a + (p.comments ?? 0), 0),
      },
    });
  } catch {
    return null;
  }
};
