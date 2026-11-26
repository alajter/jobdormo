"use server";
import { generateText } from "ai";
import { format } from "date-fns";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { userModel } from "@/lib/people/voice";
import {
  parseTellPlan,
  tellPrompt,
  tellSystemPrompt,
  type TellChange,
  type TellPlan,
} from "@/lib/tell";
import { changeJobStatus } from "@/lib/jobs/timeline";
import { createJobFromNames } from "@/lib/jobs/createJobFromNames";
import { logPersonActivity, setPersonFollowUp } from "./people.actions";
import { sanitizeString } from "@/lib/postgresText";
import { after } from "next/server";
import { checkFit } from "@/lib/fit/checkFit";
import { FIT_VERDICTS, type FitCheck } from "@/lib/fit/fitRules";
import { tailorCvForJob } from "@/lib/cv/tailor";

// "Tell Jobdormo" on Today. planTell only reads and asks the model; nothing
// changes until the owner presses Apply, which calls applyTell with the
// changes they kept.

export const planTell = async (text: string): Promise<{ success: boolean; plan?: TellPlan; message?: string }> => {
  try {
    const user = await requireUser();
    const said = text.trim();
    if (!said) return { success: false, message: "Type what happened first." };
    const [jobs, people] = await Promise.all([
      prisma.job.findMany({
        where: { userId: user.id, Status: { value: { notIn: ["archived", "expired"] } } },
        select: { id: true, Status: { select: { value: true } }, JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.contact.findMany({
        where: { createdBy: user.id },
        select: { id: true, name: true, companyName: true, Company: { select: { label: true } } },
        orderBy: [{ outreachStatus: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: 400,
      }),
    ]);
    const jobRefs = jobs.map((j) => ({ id: j.id, company: j.Company.label, title: j.JobTitle.label, status: j.Status.value }));
    const peopleRefs = people.map((p) => ({
      id: p.id,
      name: p.name,
      company: p.Company?.label ?? p.companyName ?? null,
    }));
    const { text: raw } = await generateText({
      model: await userModel(user.id),
      system: tellSystemPrompt(format(new Date(), "EEEE yyyy-MM-dd")),
      prompt: tellPrompt(said, jobRefs, peopleRefs),
    });
    return { success: true, plan: parseTellPlan(raw, jobRefs, peopleRefs) };
  } catch {
    return { success: false, message: "Jobdormo couldn't read that just now. Try again in a moment." };
  }
};

export const applyTell = async (
  changes: TellChange[],
  original: string,
): Promise<{ success: boolean; done: number; failed: string[]; addedJobId?: string }> => {
  const failed: string[] = [];
  let done = 0;
  let addedJobId: string | undefined;
  try {
    const user = await requireUser();
    const statuses = await prisma.jobStatus.findMany({ select: { id: true, value: true } });
    for (const c of changes.slice(0, 20)) {
      try {
        switch (c.kind) {
          case "job_status": {
            const statusId = statuses.find((s) => s.value === c.status)?.id;
            if (!statusId) throw new Error("status");
            await changeJobStatus({ jobId: c.jobId, userId: user.id, statusId });
            break;
          }
          case "job_outreach": {
            const res = await prisma.job.updateMany({
              where: { id: c.jobId, userId: user.id },
              data: { outreachStatus: c.outreach, outreachUpdatedAt: new Date() },
            });
            if (res.count !== 1) throw new Error("job");
            break;
          }
          case "job_note": {
            const job = await prisma.job.findFirst({ where: { id: c.jobId, userId: user.id }, select: { id: true } });
            if (!job) throw new Error("job");
            await prisma.note.create({ data: { jobId: job.id, userId: user.id, content: `<p>${escapeHtml(c.text)}</p>` } });
            break;
          }
          case "job_no_follow_up": {
            const res = await prisma.job.updateMany({ where: { id: c.jobId, userId: user.id }, data: { followUpOff: true } });
            if (res.count !== 1) throw new Error("job");
            // No follow-up on the job means no follow-up reminders for the
            // people there either (they stay in People, without a due date).
            const job = await prisma.job.findFirst({ where: { id: c.jobId, userId: user.id }, select: { companyId: true } });
            if (job) {
              await prisma.contact.updateMany({
                where: { createdBy: user.id, companyId: job.companyId, nextFollowUpAt: { not: null } },
                data: { nextFollowUpAt: null },
              });
            }
            break;
          }
          case "person_log": {
            const res = await logPersonActivity({ contactId: c.personId, kind: c.activity, text: c.text });
            if (!res.success) throw new Error("person");
            break;
          }
          case "person_follow_up": {
            const res = await setPersonFollowUp(c.personId, c.date);
            if (!res.success) throw new Error("person");
            break;
          }
          case "add_job": {
            const res = await createJobFromNames(
              {
                company: c.company,
                jobTitle: c.title,
                jobDescription: sanitizeString(original).slice(0, 60000),
                ...(c.location ? { location: c.location } : {}),
                ...(c.url ? { jobUrl: c.url } : {}),
                createdVia: "tell",
              },
              user.id,
            );
            if (!res.created && !res.duplicateOf) throw new Error("add");
            addedJobId = res.jobId ?? res.duplicateOf?.id;
            break;
          }
        }
        done++;
      } catch {
        failed.push(c.label);
      }
    }
    return { success: failed.length === 0, done, failed, addedJobId };
  } catch {
    return { success: false, done, failed: failed.length ? failed : ["Not signed in"] };
  }
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- "Does this position fit me?" for a pasted posting ----

/** Reads a pasted posting and judges the fit. Nothing is saved. */
export const checkPostingFit = async (text: string): Promise<{ success: boolean; fit?: FitCheck; message?: string }> => {
  try {
    const user = await requireUser();
    if (text.trim().length < 200) return { success: false, message: "Paste the whole posting to check the fit." };
    return { success: true, fit: await checkFit(user.id, text) };
  } catch {
    return { success: false, message: "Couldn't read that posting just now. Try again in a moment." };
  }
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Puts a checked posting on the board (with the fit as a note), and optionally tailors the CV in the background. */
export const addCheckedJob = async (
  fit: FitCheck,
  text: string,
  tailor: boolean,
): Promise<{ success: boolean; jobId?: string; message?: string }> => {
  try {
    const user = await requireUser();
    // Stored codes are the WORKPLACE_TYPES keys: REMOTE, HYBRID, ONSITE.
    const workplace = ["remote", "hybrid", "onsite"].includes(fit.workplace) ? fit.workplace.toUpperCase() : undefined;
    const res = await createJobFromNames(
      {
        company: fit.company.slice(0, 120),
        jobTitle: fit.title.slice(0, 200),
        jobDescription: sanitizeString(text).slice(0, 60000),
        ...(fit.location ? { location: fit.location.slice(0, 120) } : {}),
        ...(workplace ? { workplaceType: workplace } : {}),
        createdVia: "fit-check",
      },
      user.id,
    );
    const jobId = res.jobId ?? res.duplicateOf?.id;
    if (!jobId) return { success: false, message: "Couldn't add it to the board." };
    const job = await prisma.job.findFirst({ where: { id: jobId, userId: user.id }, select: { companyId: true } });
    if (job) {
      if (fit.track) await prisma.job.updateMany({ where: { id: jobId, userId: user.id }, data: { track: fit.track } });
      // Fill company facts only where nothing is known yet.
      const company = await prisma.company.findFirst({ where: { id: job.companyId, createdBy: user.id }, select: { size: true, description: true } });
      await prisma.company.updateMany({
        where: { id: job.companyId, createdBy: user.id },
        data: {
          ...(!company?.size && fit.size ? { size: fit.size.slice(0, 40) } : {}),
          ...(!company?.description && fit.about ? { description: fit.about } : {}),
        },
      });
      const reqs = fit.requirements.map((r) => `<li>${r.status === "met" ? "Met" : r.status === "partial" ? "Partly" : "Missing"}: ${esc(r.text)}${r.evidence ? ` (${esc(r.evidence)})` : ""}</li>`).join("");
      await prisma.note.create({
        data: {
          jobId,
          userId: user.id,
          content: `<p><strong>Fit check: ${FIT_VERDICTS[fit.verdict].label}.</strong> ${esc(fit.summary)}</p>${fit.whyApply.length ? `<p>Why apply: ${fit.whyApply.map(esc).join(" · ")}</p>` : ""}${fit.whyNot.length ? `<p>Why not: ${fit.whyNot.map(esc).join(" · ")}</p>` : ""}${reqs ? `<ul>${reqs}</ul>` : ""}`,
        },
      });
    }
    if (tailor) after(() => tailorCvForJob(user.id, jobId).then(() => undefined).catch(() => undefined));
    return { success: true, jobId };
  } catch {
    return { success: false, message: "Couldn't add it to the board." };
  }
};
