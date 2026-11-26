"use server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { candidateContext, userModel } from "@/lib/people/voice";
import { DEFAULT_PILLARS } from "@/lib/posts/autoPost";

// LinkedIn campaign manager: one active campaign (goal, audience, content
// themes, cadence), an AI plan of dated post ideas for it, and the results of
// what was posted, so the next plan learns from them.

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  audience: string;
  pillars: string;
  cadence: number;
  weeks: number;
  startDate: Date;
  notes: string | null;
};

const SELECT = {
  id: true,
  name: true,
  goal: true,
  audience: true,
  pillars: true,
  cadence: true,
  weeks: true,
  startDate: true,
  notes: true,
};

// A starting point built from what the app knows about the search; the user
// edits it before the first plan.
const DEFAULTS = {
  name: "Next role: visibility",
  goal: "Be known among founders, hiring managers and peers in my field as someone who builds and ships, so conversations about the right roles come to me.",
  audience: "Founders and leaders at companies I'd like to work for, hiring managers and recruiters in my field, investors and talent partners, and peers who might refer me.",
  pillars: DEFAULT_PILLARS.join("\n"),
  cadence: 2,
  weeks: 6,
};

export const getCampaign = async (): Promise<Campaign | null> => {
  try {
    const user = await requireUser();
    return await prisma.linkedinCampaign.findFirst({
      where: { userId: user.id, active: true },
      select: SELECT,
      orderBy: { updatedAt: "desc" },
    });
  } catch {
    return null;
  }
};

export const getCampaignDefaults = async () => {
  await requireUser();
  return DEFAULTS;
};

export const saveCampaign = async (input: {
  id?: string;
  name: string;
  goal: string;
  audience: string;
  pillars: string;
  cadence: number;
  weeks: number;
  startDate: string;
  notes?: string;
}): Promise<{ success: boolean; id?: string; message?: string }> => {
  try {
    const user = await requireUser();
    const start = new Date(input.startDate);
    if (!input.goal?.trim() || !input.audience?.trim() || !input.pillars?.trim()) {
      return { success: false, message: "Fill in the goal, audience and themes." };
    }
    const data = {
      name: (input.name?.trim() || "LinkedIn campaign").slice(0, 120),
      goal: input.goal.trim().slice(0, 2000),
      audience: input.audience.trim().slice(0, 2000),
      pillars: input.pillars.trim().slice(0, 3000),
      cadence: Math.min(Math.max(Math.round(input.cadence) || 2, 1), 5),
      weeks: Math.min(Math.max(Math.round(input.weeks) || 6, 1), 12),
      startDate: isNaN(+start) ? new Date() : start,
      notes: input.notes?.trim().slice(0, 3000) || null,
    };
    if (input.id) {
      const res = await prisma.linkedinCampaign.updateMany({ where: { id: input.id, userId: user.id }, data });
      if (res.count === 0) return { success: false, message: "Campaign not found." };
      return { success: true, id: input.id };
    }
    await prisma.linkedinCampaign.updateMany({ where: { userId: user.id, active: true }, data: { active: false } });
    const created = await prisma.linkedinCampaign.create({ data: { ...data, userId: user.id } });
    return { success: true, id: created.id };
  } catch {
    return { success: false, message: "Couldn't save the campaign." };
  }
};

// Posting days by cadence (0 = Sunday): weekday mornings are when LinkedIn
// reach is best for a B2B audience.
const DAYS: Record<number, number[]> = { 1: [2], 2: [2, 4], 3: [1, 3, 4], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4] };

/** Dated slots for the campaign: `cadence` weekdays per week, 08:30, from the start date. */
async function planSlots(start: Date, cadence: number, weeks: number): Promise<Date[]> {
  const days = DAYS[cadence] ?? DAYS[2];
  const out: Date[] = [];
  const d = new Date(start);
  d.setHours(8, 30, 0, 0);
  const end = new Date(d.getTime() + weeks * 7 * 86400000);
  while (d < end && out.length < cadence * weeks) {
    if (days.includes(d.getDay())) out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

type Idea = { pillar?: string; topic?: string; angle?: string; hook?: string };

function parseIdeas(text: string): Idea[] {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return [];
  try {
    const j = JSON.parse(text.slice(s, e + 1));
    return Array.isArray(j.posts) ? j.posts : [];
  } catch {
    return [];
  }
}

/**
 * Plans the campaign: one dated idea per slot (theme, topic, angle, hook),
 * saved as "idea" posts. Replaces the campaign's ideas not yet written;
 * drafts and posted posts are kept.
 */
export const generatePlan = async (
  campaignId: string,
): Promise<{ success: boolean; count?: number; message?: string }> => {
  try {
    const user = await requireUser();
    const c = await prisma.linkedinCampaign.findFirst({ where: { id: campaignId, userId: user.id }, select: SELECT });
    if (!c) return { success: false, message: "Campaign not found." };
    const kept = await prisma.linkedinPost.findMany({
      where: { userId: user.id, campaignId: c.id, status: { in: ["draft", "posted"] } },
      select: { scheduledFor: true, topic: true },
    });
    const taken = new Set(kept.map((k) => k.scheduledFor?.toISOString()).filter(Boolean));
    const slots = (await planSlots(c.startDate, c.cadence, c.weeks)).filter((s) => !taken.has(s.toISOString()));
    if (!slots.length) return { success: false, message: "Every slot already has a draft or a posted post." };

    const results = await prisma.linkedinPost.findMany({
      where: { userId: user.id, status: "posted" },
      select: { topic: true, pillar: true, impressions: true, reactions: true, comments: true },
      orderBy: { postedAt: "desc" },
      take: 10,
    });
    const { notes, cv } = await candidateContext(user.id);
    const model = await userModel(user.id);
    const { text } = await generateText({
      model,
      system: `You are a LinkedIn campaign manager for a job seeker. Plan posts that serve their goal with their audience.
Rules:
- Every idea must rest on true things from their CV, notes and past posts. Never invent experiences, numbers, customers or results; if an idea needs a fact they haven't given, phrase the angle as a question or opinion instead.
- Follow every rule in their notes (things never to make public, companies never to name, titles to avoid). Never name confidential customers.
- Mix formats: a story with a lesson, a clear opinion on their domain, showing their work, a practical how-to, and a question that invites comments. At most one post in the plan says outright that they're looking for a role, and not in the first week.
- Spread the themes evenly. Each idea is specific (one story, one claim), not a generic topic.
- The hook is the first line, plain and concrete, under 15 words, no clickbait, no emoji.
Return ONLY a JSON object: {"posts": [{"pillar": "one of the themes, verbatim", "topic": "short title", "angle": "two or three sentences: what the post says and which true facts it uses", "hook": "first line"}]}. Exactly ${slots.length} posts, in posting order. Use single quotes inside strings.`,
      prompt: `Campaign: ${c.name}
Goal: ${c.goal}
Audience: ${c.audience}
Themes (one per line):
${c.pillars}
${c.notes ? `Their notes for this campaign: ${c.notes}\n` : ""}Cadence: ${c.cadence} posts a week for ${c.weeks} weeks.
${kept.length ? `Already written or posted (don't repeat): ${kept.map((k) => k.topic).filter(Boolean).join("; ")}\n` : ""}${
        results.length
          ? `Results of their past posts (do more of what worked):\n${results
              .map((r) => `- ${r.topic ?? "post"} [${r.pillar ?? "-"}]: ${r.impressions ?? "?"} impressions, ${r.reactions ?? "?"} reactions, ${r.comments ?? "?"} comments`)
              .join("\n")}\n`
          : ""
      }
Their notes and rules:
${notes}

Their CV:
${cv.slice(0, 5000)}`,
      temperature: 0.6,
    });
    const ideas = parseIdeas(text).filter((i) => i && i.topic);
    if (!ideas.length) return { success: false, message: "The AI didn't return a usable plan. Try again." };

    await prisma.linkedinPost.deleteMany({ where: { userId: user.id, campaignId: c.id, status: "idea" } });
    const rows = slots.slice(0, ideas.length).map((when, i) => ({
      userId: user.id,
      campaignId: c.id,
      scheduledFor: when,
      status: "idea",
      pillar: ideas[i].pillar?.slice(0, 200) ?? null,
      topic: ideas[i].topic!.slice(0, 300),
      angle: [ideas[i].angle, ideas[i].hook ? `Hook: ${ideas[i].hook}` : ""].filter(Boolean).join("\n").slice(0, 2000) || null,
      body: "",
    }));
    await prisma.linkedinPost.createMany({ data: rows });
    return { success: true, count: rows.length };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't plan the campaign." };
  }
};

/** Results of a posted post, read off LinkedIn by the user. */
export const savePostMetrics = async (
  postId: string,
  m: { impressions?: number | null; reactions?: number | null; comments?: number | null },
): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    const n = (v: number | null | undefined) => (v == null || isNaN(v) ? null : Math.max(0, Math.round(v)));
    const res = await prisma.linkedinPost.updateMany({
      where: { id: postId, userId: user.id },
      data: { impressions: n(m.impressions), reactions: n(m.reactions), comments: n(m.comments) },
    });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};
