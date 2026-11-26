import "server-only";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { candidateContext, userModel, VOICE } from "@/lib/people/voice";
import { nextPostSlot } from "./nextSlot";

// Keeps the next LinkedIn post ready without being asked: after a post goes
// out (and every morning), if nothing is scheduled ahead, pick the next slot,
// choose a topic that rotates the themes and learns from past results, and
// draft it in the owner's voice. Nothing is ever posted from here.

// Themes used when there's no campaign yet (same as the campaign defaults).
export const DEFAULT_PILLARS = [
  "Building with AI: what worked, what didn't, and what you'd do again",
  "Your field from the customer side: what makes people adopt or drop a product",
  "Career lessons: building from zero, working with customers, starting over",
  "Show the work: things you build and what they taught you",
];

/** The post text, in the owner's voice. Shared by the Posts page and the automatic drafts. */
export async function draftPostText(
  userId: string,
  input: { postId?: string; topic: string; notes?: string; current?: string; instructions?: string },
): Promise<string> {
  const topic = input.topic?.trim().slice(0, 300);
  const posted = await prisma.linkedinPost.findMany({
    where: { userId, status: "posted" },
    select: { body: true },
    orderBy: { postedAt: "desc" },
    take: 3,
  });
  const { notes, cv, examples } = await candidateContext(userId);
  const model = await userModel(userId);
  // A planned post carries its campaign (goal, audience) and its angle and hook.
  const planned = input.postId
    ? await prisma.linkedinPost.findFirst({
        where: { id: input.postId, userId },
        select: { pillar: true, angle: true, campaign: { select: { goal: true, audience: true, notes: true } } },
      })
    : null;
  const campaignBlock = planned?.campaign
    ? `\nCampaign goal: ${planned.campaign.goal}\nAudience: ${planned.campaign.audience}\n${planned.pillar ? `Theme: ${planned.pillar}\n` : ""}${planned.angle ? `Planned angle and hook (use the hook as the first line unless they changed it):\n${planned.angle}\n` : ""}${planned.campaign.notes ? `Their campaign notes: ${planned.campaign.notes}\n` : ""}`
    : planned?.angle
      ? `\n${planned.pillar ? `Theme: ${planned.pillar}\n` : ""}Planned angle and hook (use the hook as the first line):\n${planned.angle}\n`
      : "";
  const prompt = `${input.current?.trim() ? `Rewrite this LinkedIn post. ${input.instructions?.trim() ? `Their instructions: ${input.instructions.trim().slice(0, 1000)}` : "Make it sound more like them."}\n\nCurrent post:\n${input.current.trim().slice(0, 4000)}` : `Write a LinkedIn post about: ${topic}`}
${input.notes?.trim() ? `\nHis notes and facts for this post (use only these facts about it):\n${input.notes.trim().slice(0, 3000)}\n` : ""}
${campaignBlock}
Facts: use only what is in their notes, CV and past posts. Never add an anecdote, a customer reaction, a conversation, a quote or a number that isn't there; if the post needs one, leave it out.
Format: a LinkedIn post of 80 to 200 words. Short paragraphs of one to three sentences. Plain, a bit casual, first person. No hashtag walls (at most 2 hashtags, or none), no "I'm thrilled to announce", no hype, no em dashes. If there's a link, say "Link in the comments" instead of pasting it.

Their notes and rules (follow them, e.g. companies they never names):
${notes}

Their CV (background only; don't turn the post into a CV):
${cv.slice(0, 4000)}

How they write (voice only, not facts):
${examples}
${posted.length ? `\nPosts they published (voice):\n${posted.map((p) => p.body.slice(0, 1500)).join("\n---\n")}` : ""}`;
  const res = await generateText({ model, system: VOICE, prompt, temperature: 0.5 });
  return res.text.trim().replace(/^["']|["']$/g, "");
}

type Idea = { pillar: string; topic: string; angle: string; hook: string };

function parseIdea(raw: string): Idea | null {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    const o = JSON.parse(raw.slice(s, e + 1)) as Partial<Idea>;
    if (!o.topic || !o.angle) return null;
    return { pillar: String(o.pillar ?? ""), topic: String(o.topic).slice(0, 200), angle: String(o.angle).slice(0, 1200), hook: String(o.hook ?? "").slice(0, 200) };
  } catch {
    return null;
  }
}

/** One next post idea: rotates the themes, avoids repeats, leans on what got the best results. */
async function pickNextIdea(userId: string): Promise<Idea | null> {
  const [campaign, past] = await Promise.all([
    prisma.linkedinCampaign.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { goal: true, audience: true, pillars: true, notes: true } }),
    prisma.linkedinPost.findMany({
      where: { userId },
      select: { topic: true, pillar: true, status: true, impressions: true, reactions: true, comments: true, body: true },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);
  const pillars = campaign?.pillars?.split("\n").map((p) => p.trim()).filter(Boolean) ?? DEFAULT_PILLARS;
  const { notes, cv } = await candidateContext(userId);
  const { text } = await generateText({
    model: await userModel(userId),
    system: `You plan the next LinkedIn post for a job seeker. One idea only.
Rules:
- Pick a theme different from their most recent post's theme, unless one theme is clearly getting better results.
- Every idea rests on true facts from their CV, notes and past posts. Never invent experiences, numbers, customers, customer reactions, conversations or results; the angle may only use facts you can point to.
- Follow every rule in their notes (things never to make public, companies never to name, titles to avoid).
- Only name tools or projects that are already public (ones their published posts link to). Never name a private, unreleased or internal project.
- Not a repeat of a past topic. Specific (one story, one claim), not a generic topic.
- The hook is the first line: plain, concrete, under 15 words, no clickbait, no emoji.
Return ONLY JSON: {"pillar":"one of the themes, verbatim","topic":"short title","angle":"two or three sentences: what the post says and which true facts it uses","hook":"first line"}. Use single quotes inside strings.`,
    prompt: `${campaign ? `Campaign goal: ${campaign.goal}\nAudience: ${campaign.audience}\n${campaign.notes ? `Campaign notes: ${campaign.notes}\n` : ""}` : ""}Themes:
${pillars.join("\n")}

Past posts, newest first:
${past.length ? past.map((p) => `- [${p.status}] ${p.topic ?? p.body.slice(0, 80)} (theme: ${p.pillar ?? "-"}; ${p.impressions ?? "?"} impressions, ${p.reactions ?? "?"} reactions, ${p.comments ?? "?"} comments)`).join("\n") : "(none)"}

Their notes and rules:
${notes}

Their CV:
${cv.slice(0, 5000)}`,
    temperature: 0.7,
  });
  return parseIdea(text);
}

/**
 * Makes sure a drafted post is waiting in the next slot. Returns the post id
 * if one was created, null if one was already waiting (or nothing to do).
 */
export async function ensureNextPost(userId: string, now = new Date()): Promise<{ created: string | null; scheduledFor: Date | null }> {
  const waiting = await prisma.linkedinPost.findFirst({
    where: { userId, status: { in: ["idea", "draft"] }, scheduledFor: { gte: now } },
    select: { id: true, body: true, topic: true, scheduledFor: true },
    orderBy: { scheduledFor: "asc" },
  });
  if (waiting) {
    // A planned idea without text yet: write it.
    if (!waiting.body.trim() && waiting.topic) {
      const body = await draftPostText(userId, { postId: waiting.id, topic: waiting.topic });
      await prisma.linkedinPost.update({ where: { id: waiting.id }, data: { body, status: "draft" } });
    }
    return { created: null, scheduledFor: waiting.scheduledFor };
  }
  const [last, taken] = await Promise.all([
    prisma.linkedinPost.findFirst({ where: { userId, status: "posted" }, select: { postedAt: true }, orderBy: { postedAt: "desc" } }),
    prisma.linkedinPost.findMany({ where: { userId, scheduledFor: { gte: now } }, select: { scheduledFor: true } }),
  ]);
  const scheduledFor = nextPostSlot({ now, lastPostedAt: last?.postedAt, taken: taken.map((t) => t.scheduledFor!).filter(Boolean) });
  const idea = await pickNextIdea(userId);
  if (!idea) return { created: null, scheduledFor: null };
  const angle = `${idea.angle}${idea.hook ? `\nHook: ${idea.hook}` : ""}`;
  const post = await prisma.linkedinPost.create({
    data: { userId, status: "idea", topic: idea.topic, pillar: idea.pillar || null, angle, scheduledFor, body: "" },
  });
  const body = await draftPostText(userId, { postId: post.id, topic: idea.topic });
  await prisma.linkedinPost.update({ where: { id: post.id }, data: { body, status: "draft" } });
  return { created: post.id, scheduledFor };
}
