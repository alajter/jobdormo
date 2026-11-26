"use server";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { cvPath, loadCvTracks } from "@/lib/cv/tracks";

export type CvLibrary = {
  tracks: { id: string; label: string; pdf: string | null; updatedAt: Date | null }[];
  jobCvs: {
    jobId: string;
    company: string;
    title: string;
    status: string;
    ats: number | null;
    mustFix: number;
    pdf: boolean;
    updatedAt: Date | null;
  }[];
  other: { name: string; pdf: string; updatedAt: Date }[];
};

const pdfOf = (rel: string) => rel.replace(/\.html$/, ".pdf");
const mtime = (rel: string): Date | null => {
  const p = cvPath(rel);
  return p && existsSync(p) ? statSync(p).mtime : null;
};

/** Everything on My CVs: track CVs, the CV made for each job, and other PDFs (portfolio, letters). */
export const getCvLibrary = async (): Promise<CvLibrary> => {
  const user = await requireUser();
  const tracks = loadCvTracks().map((t) => {
    const pdf = pdfOf(t.file);
    const at = mtime(pdf);
    return { id: t.id, label: t.label, pdf: at ? pdf : null, updatedAt: at };
  });
  const jobs = await prisma.job.findMany({
    where: { userId: user.id, tailoredCv: { not: null } },
    select: {
      id: true,
      tailoredCv: true,
      atsTailored: true,
      cvReview: true,
      Status: { select: { label: true } },
      JobTitle: { select: { label: true } },
      Company: { select: { label: true } },
    },
    orderBy: { atsCheckedAt: { sort: "desc", nulls: "last" } },
  });
  const used = new Set(jobs.map((j) => path.basename(pdfOf(j.tailoredCv!))));
  const jobCvs = jobs.map((j) => {
    let mustFix = 0;
    try {
      mustFix = (JSON.parse(j.cvReview ?? "[]") as { severity?: string }[]).filter((i) => i.severity === "high").length;
    } catch {
      mustFix = 0;
    }
    const at = mtime(pdfOf(j.tailoredCv!));
    return {
      jobId: j.id,
      company: j.Company.label,
      title: j.JobTitle.label,
      status: j.Status.label,
      ats: j.atsTailored,
      mustFix,
      pdf: !!at,
      updatedAt: at,
    };
  });
  // Other PDFs a person made by hand (portfolio, cover letters, older job CVs).
  const other: CvLibrary["other"] = [];
  for (const dir of ["generic", "jobs"]) {
    const abs = cvPath(dir);
    if (!abs || !existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (!f.endsWith(".pdf") || used.has(f)) continue;
      const rel = `${dir}/${f}`;
      if (tracks.some((t) => t.pdf === rel)) continue;
      other.push({ name: f.replace(/^[A-Z][a-z]+_[A-Z][a-z]+_/, "").replace(/\.pdf$/, "").replace(/_/g, " "), pdf: rel, updatedAt: statSync(path.join(abs, f)).mtime });
    }
  }
  other.sort((a, b) => +b.updatedAt - +a.updatedAt);
  return { tracks, jobCvs, other };
};
