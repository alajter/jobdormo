"use server";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { rankFocus, type FocusVerb } from "@/lib/focus";
import { getPeopleAtCompanies, getSearchHQ, type PersonRow } from "./people.actions";
import { getDailyScanStatus, type DailyScanStatus } from "@/lib/schedule/dailyScan";

// Days after applying with no reply before an application shows up as
// "check in" on Today.
const APPLIED_QUIET_DAYS = 10;

export type TodayFocusRow = {
  id: string;
  verb: FocusVerb;
  reason: string;
  title: string;
  company: string;
  companyMeta: string | null;
  match: number | null;
  ats: number | null;
  // Whether `ats` is the tailored CV's score or the generic CV's.
  atsTailored: boolean;
  jobUrl: string | null;
  // Who you know there: how many, and the best few to ask.
  known: { count: number; people: PersonRow[] };
};

export type TodayQuietApplication = { id: string; title: string; company: string; appliedAt: Date; days: number; known: { count: number; people: PersonRow[] } };

export type TodayData = {
  focus: TodayFocusRow[];
  due: PersonRow[];
  quiet: TodayQuietApplication[];
  week: { conversations: number; goal: number; sent: number };
  nextPost: { id: string; topic: string | null; body: string; status: string; scheduledFor: Date | null } | null;
  // Posted 2+ days ago with no results logged yet.
  resultsDue: { id: string; topic: string | null; postedAt: Date }[];
  lastPostedAt: Date | null;
  scan: DailyScanStatus | null;
};

const highIssues = (review: string | null): number => {
  if (!review) return 0;
  try {
    return (JSON.parse(review) as { severity?: string }[]).filter((i) => i.severity === "high").length;
  } catch {
    return 0;
  }
};

export const getToday = async (): Promise<{ success: true; data: TodayData } | { success: false }> => {
  try {
    const user = await requireUser();
    const quietBefore = new Date(Date.now() - APPLIED_QUIET_DAYS * 86_400_000);
    const resultsBefore = new Date(Date.now() - 2 * 86_400_000);
    const [open, quiet, hq, scan, resultsDue] = await Promise.all([
      prisma.job.findMany({
        where: { userId: user.id, Status: { value: { in: ["new", "draft"] } } },
        select: {
          id: true,
          matchScore: true,
          atsBase: true,
          atsTailored: true,
          tailoredCv: true,
          cvReview: true,
          outreachStatus: true,
          postedAt: true,
          jobUrl: true,
          automationId: true,
          createdVia: true,
          JobTitle: { select: { label: true } },
          Company: { select: { id: true, label: true, size: true, stage: true } },
        },
        take: 200,
      }),
      prisma.job.findMany({
        where: {
          userId: user.id,
          Status: { value: "applied" },
          appliedDate: { lte: quietBefore },
          followUpOff: false,
          OR: [{ outreachStatus: null }, { outreachStatus: { in: ["none", "no_reply"] } }],
        },
        select: { id: true, appliedDate: true, JobTitle: { select: { label: true } }, Company: { select: { id: true, label: true } } },
        orderBy: { appliedDate: "asc" },
        take: 10,
      }),
      getSearchHQ(),
      getDailyScanStatus().catch(() => null),
      prisma.linkedinPost.findMany({
        where: { userId: user.id, status: "posted", postedAt: { lte: resultsBefore }, impressions: null },
        select: { id: true, topic: true, postedAt: true },
        orderBy: { postedAt: "desc" },
        take: 3,
      }),
    ]);

    const known = await getPeopleAtCompanies([...new Set([...open, ...quiet].map((j) => j.Company.id))], 2);
    const none = { count: 0, people: [] as PersonRow[] };
    const companyOf = new Map(open.map((j) => [j.id, j.Company.id]));
    const urlOf = new Map(open.map((j) => [j.id, j.jobUrl]));

    const ranked = rankFocus(
      open.map((j) => ({
        id: j.id,
        title: j.JobTitle.label,
        company: j.Company.label,
        size: j.Company.size,
        stage: j.Company.stage,
        match: j.matchScore,
        atsBase: j.atsBase,
        atsTailored: j.atsTailored,
        hasTailored: !!j.tailoredCv,
        highIssues: highIssues(j.cvReview),
        outreachStatus: j.outreachStatus,
        postedAt: j.postedAt,
        addedByYou: !j.automationId && j.createdVia !== "daily-web-agent",
      })),
    );

    const now = Date.now();
    const hqData = hq.success ? hq.data : null;
    return {
      success: true,
      data: {
        focus: ranked.map((r) => ({
          id: r.id,
          verb: r.verb,
          reason: r.reason,
          title: r.job.title,
          company: r.job.company,
          companyMeta: [r.job.stage, r.job.size && `${r.job.size} people`].filter(Boolean).join(" · ") || null,
          match: r.job.match,
          ats: r.job.hasTailored ? r.job.atsTailored : r.job.atsBase,
          atsTailored: r.job.hasTailored,
          jobUrl: urlOf.get(r.id) ?? null,
          known: known[companyOf.get(r.id) ?? ""] ?? none,
        })),
        due: hqData?.due ?? [],
        quiet: quiet
          .filter((q) => q.appliedDate)
          .map((q) => ({
            id: q.id,
            title: q.JobTitle.label,
            company: q.Company.label,
            appliedAt: q.appliedDate!,
            days: Math.floor((now - q.appliedDate!.getTime()) / 86_400_000),
            known: known[q.Company.id] ?? none,
          })),
        week: { conversations: hqData?.conversations ?? 0, goal: 5, sent: hqData?.sentThisWeek ?? 0 },
        nextPost: hqData?.posts[0] ?? null,
        resultsDue: resultsDue.filter((p) => p.postedAt).map((p) => ({ id: p.id, topic: p.topic, postedAt: p.postedAt! })),
        lastPostedAt: hqData?.lastPostedAt ?? null,
        scan,
      },
    };
  } catch {
    return { success: false };
  }
};
