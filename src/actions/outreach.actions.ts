"use server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { getModel } from "@/lib/ai";
import { getUserAiSettings, getDefaultModelForProvider } from "@/lib/scraper/automation-run/aiSettings";
import { readAboutMe, readOutreachExamples, readTrackCvText } from "@/lib/cv/tracks";
import { defaultUserSettings, type UserSettingsData } from "@/models/userSettings.model";
import { OUTREACH_KINDS, isOutreachStatus, type OutreachKind } from "@/models/outreach.model";

// Drafts a LinkedIn note, LinkedIn message or email about one job, in the
// user's own voice (from messages they actually sent), using only facts
// from their CV, notes and what they say about the recipient.

const voiceRules = (signOff: string) => `Write as the candidate, in their own voice: warm, plain, short sentences, the way their example messages read. Open with "Hi <first name>, how are you?".
Rules:
- Use only facts from their CV, their notes, and what they say about the recipient. Never invent how they know each other, shared history, or that they read or liked their posts.
- Mention mutual connections only if they say there are some; never guess a number.
- Don't name their past employers; their profile shows them. Describe the work instead (e.g. "six years in B2B SaaS", "led product at an early-stage startup").
- Don't apologise for or explain gaps; the call is for that. No buzzwords, no em dashes, no emoji unless their examples use them.
- One clear ask at the end.
- Sign off with "${signOff}".
- Output ONLY the message text (for an email: a "Subject: ..." line, a blank line, then the body). No quotes, no commentary.`;

const KIND_RULES: Record<OutreachKind, string> = {
  connection_note: "A LinkedIn connection request note: at most 300 characters including spaces and line breaks. Three or four short lines.",
  linkedin_message: "A LinkedIn message: 60 to 130 words.",
  email: "An email: a short subject line and a body of 60 to 150 words.",
};

export const draftOutreach = async (input: {
  jobId: string;
  kind: OutreachKind;
  recipientName: string;
  recipientRole: string;
  relationship: string;
  goal: string;
}): Promise<{ success: boolean; text?: string; message?: string }> => {
  try {
    const user = await requireUser();
    if (!OUTREACH_KINDS.includes(input.kind)) return { success: false, message: "Unknown message type." };
    const name = input.recipientName.trim().slice(0, 80);
    if (!name) return { success: false, message: "Add who it's to." };
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, userId: user.id },
      include: { JobTitle: true, Company: true, Location: true },
    });
    if (!job) return { success: false, message: "Job not found." };

    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
    const cv = (job.track && readTrackCvText(job.track)) || "";
    const plainJob = job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 3000);

    const ai = await getUserAiSettings(user.id);
    const model = await getModel(ai.provider, ai.model || getDefaultModelForProvider(ai.provider), user.id);

    const prompt = `Message type: ${KIND_RULES[input.kind]}
Recipient: ${name}${input.recipientRole ? `, ${input.recipientRole.slice(0, 120)}` : ""}
How they're connected (from the candidate): ${input.relationship.slice(0, 400) || "not stated"}
What they want from this message: ${input.goal.slice(0, 400) || "a short call about the role"}

The job: ${job.JobTitle.label} at ${job.Company.label}${job.Location?.label ? ` (${job.Location.label})` : ""}.
${job.Company.description ? `About the company: ${job.Company.description}\n` : ""}Posting: ${plainJob}

Their CV:
${cv || "(no CV text available)"}

Their notes about themselves:
${[settings.candidate?.notes ?? "", settings.candidate?.facts ?? "", readAboutMe()].filter(Boolean).join("\n").slice(0, 12000)}

Messages they actually sent (match this voice and length, not their facts):
${readOutreachExamples().slice(0, 6000)}`;

    let text = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await generateText({
        model,
        system: voiceRules((user.name ?? "").trim().split(/\s+/)[0] || "me"),
        prompt: attempt === 0 ? prompt : `${prompt}\n\nYour last draft was ${text.length} characters; the limit is 300. Rewrite it shorter.\n\nLast draft:\n${text}`,
        temperature: 0.4,
      });
      text = res.text.trim().replace(/^["']|["']$/g, "");
      if (input.kind !== "connection_note" || text.length <= 300) break;
    }
    return { success: true, text };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't draft the message." };
  }
};

/** "Mark as sent": logs the final text on the job's notes. */
export const logOutreachSent = async (input: {
  jobId: string;
  kind: OutreachKind;
  recipientName: string;
  recipientRole: string;
  text: string;
}): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, userId: user.id },
      select: { id: true, outreachStatus: true },
    });
    if (!job) return { success: false };
    // A new message means waiting again, unless they already referred them.
    if (job.outreachStatus !== "referred") {
      await prisma.job.updateMany({
        where: { id: job.id, userId: user.id },
        data: { outreachStatus: "sent", outreachUpdatedAt: new Date() },
      });
    }
    const label = { connection_note: "LinkedIn connection note", linkedin_message: "LinkedIn message", email: "Email" }[input.kind];
    const who = `${input.recipientName.trim()}${input.recipientRole.trim() ? ` (${input.recipientRole.trim()})` : ""}`;
    await prisma.note.create({
      data: {
        jobId: job.id,
        userId: user.id,
        content: `${new Date().toISOString().slice(0, 10)}: sent ${label} to ${who}:\n\n${input.text.slice(0, 4000)}`,
      },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
};

/** Sets (or clears, with null) the job's reach-out status. */
export const setOutreachStatus = async (
  jobId: string,
  status: string | null,
): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    if (status !== null && !isOutreachStatus(status)) return { success: false };
    const res = await prisma.job.updateMany({
      where: { id: jobId, userId: user.id },
      data: { outreachStatus: status, outreachUpdatedAt: status ? new Date() : null },
    });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};

