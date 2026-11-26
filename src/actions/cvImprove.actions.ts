"use server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { getModel } from "@/lib/ai";
import { getUserAiSettings } from "@/lib/scraper/automation-run/aiSettings";
import { getDefaultModelForProvider } from "@/lib/scraper/automation-run/aiSettings";
import {
  loadCvTracks,
  CV_MAX_PAGES,
  readAboutMe,
  readTrackCvHtml,
  renderTrackCvPdf,
  restoreTrackCvHtml,
  writeTrackCvHtml,
} from "@/lib/cv/tracks";
import { startBackgroundRematch } from "@/lib/jobs/rematch";
import { applyCvEdits, listCvBlocks, sanitizeInline, type CvEdit } from "@/lib/cv/cvEdits";
import { CANDIDATE_FACTS_MAX_CHARS, defaultUserSettings, type UserSettingsData } from "@/models/userSettings.model";

// "Improve my CV" for one gap and one CV track: (1) the AI asks for real
// facts, (2) proposes edits to numbered CV blocks from those facts only, and
// (3) the chosen edits are written to the track's HTML CV, the PDF is
// re-rendered, the facts are kept in the candidate notes, and the track's
// jobs are re-matched in the background.

export type CvQa = { question: string; answer: string };
export type ProposedEdit = CvEdit & { before: string | null; context: string };

const RULES = `Writing rules for this CV:
- Use only facts that appear in the current CV, the candidate's notes, or the answers below. Never invent numbers, names, titles, customers or outcomes.
- If the answers don't give a real fact for something, leave it out rather than writing around it.
- Never name customers the notes call confidential; "Fortune 100" or "global enterprises" is fine.
- Plain, specific English. No buzzwords, no programming-language lists, no em dashes.
- Keep bullets to one or two lines; the CV must stay within two pages, so prefer rewriting a weak bullet over adding one.`;

async function modelFor(userId: string) {
  const ai = await getUserAiSettings(userId);
  return getModel(ai.provider, ai.model || getDefaultModelForProvider(ai.provider), userId);
}

async function candidateNotes(userId: string): Promise<string> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
  return [settings.candidate?.notes ?? "", settings.candidate?.facts ?? "", readAboutMe()]
    .filter(Boolean)
    .join("\n\n");
}

function parseJsonBlock<T>(text: string, open: "[" | "{"): T | null {
  const close = open === "[" ? "]" : "}";
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function trackOrThrow(trackId: string) {
  const track = loadCvTracks().find((t) => t.id === trackId);
  if (!track) throw new Error("Unknown CV track");
  return track;
}

export type GapInput = { gap: string; advice: string; jobs: string[] };
export type CvQuestion = { gap: string; question: string };

const describeGaps = (gaps: GapInput[]) =>
  gaps
    .map((g) => `- ${g.gap}\n  Advice: ${g.advice}\n  Jobs: ${g.jobs.slice(0, 8).join("; ")}`)
    .join("\n");

/**
 * Step 1: questions asking for the real facts these gaps need, grouped by
 * gap (two per gap at most, ten in all). Gaps a CV edit can't honestly fix
 * (e.g. years of experience) get no questions.
 */
export const getCvQuestions = async (input: {
  gaps: GapInput[];
  trackId: string;
}): Promise<{ success: boolean; questions?: CvQuestion[]; skipped?: string[]; message?: string }> => {
  try {
    const user = await requireUser();
    trackOrThrow(input.trackId);
    const html = readTrackCvHtml(input.trackId);
    if (!html) return { success: false, message: "Couldn't read that CV file." };
    const gaps = input.gaps.slice(0, 8);
    const cv = listCvBlocks(html).map((b) => `[${b.context}] ${b.text}`).join("\n");
    const { text } = await generateText({
      model: await modelFor(user.id),
      system: `You help a job seeker close gaps that job matches keep flagging, using only true facts. For each gap where real facts could improve this CV, ask one or two questions that would surface specific facts (numbers, scope, examples). Ask about what they actually did; never suggest claiming something. Skip gaps no CV fact can honestly close (such as years of experience or a missing title) and list them in "skipped". At most 10 questions in total.
Return ONLY a JSON object, no prose: {"questions": [{"gap": "<gap name exactly as given>", "question": "..."}], "skipped": ["<gap name>"]}. Use single quotes inside strings.`,
      prompt: `Gaps:\n${describeGaps(gaps)}\n\nCandidate notes:\n${await candidateNotes(user.id)}\n\nCurrent CV:\n${cv}`,
      temperature: 0.3,
    });
    const parsed = parseJsonBlock<{ questions?: CvQuestion[]; skipped?: string[] }>(text, "{");
    const names = new Set(gaps.map((g) => g.gap));
    const questions = (parsed?.questions ?? [])
      .filter((q) => q && typeof q.question === "string" && typeof q.gap === "string")
      .map((q) => ({ gap: names.has(q.gap) ? q.gap : gaps[0].gap, question: q.question }))
      .slice(0, 10);
    if (!questions.length) {
      return {
        success: false,
        message: "None of these gaps can be closed with CV facts; they're for interview prep.",
      };
    }
    const skipped = (parsed?.skipped ?? []).filter((s) => names.has(s));
    return { success: true, questions, skipped };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
};

// Edits for one CV from the candidate's answers. With `reference`, the
// edits already made to another CV are passed as a model: make the
// equivalent changes here, fitted to this CV's focus.
async function draftEdits(
  userId: string,
  trackId: string,
  gaps: string[],
  answers: CvQa[],
  reference?: { label: string; edits: { before: string | null; after: string; context: string }[] },
): Promise<ProposedEdit[]> {
  const html = readTrackCvHtml(trackId);
  if (!html) throw new Error("Couldn't read that CV file.");
  const track = trackOrThrow(trackId);
  const blocks = listCvBlocks(html);
  const numbered = blocks.map((b) => `${b.index}. [${b.kind} | ${b.context}] ${b.html}`).join("\n");
  const ref = reference
    ? `\n\nThe same facts were just added to the candidate's "${reference.label}" CV like this (before -> after):\n${reference.edits
        .map((r) => `- [${r.context}] ${r.before ?? "(new bullet)"} -> ${r.after}`)
        .join("\n")}\nMake the equivalent changes in THIS CV ("${track.label}"), fitted to its focus. Skip facts that don't serve this CV. Keep it within two pages: prefer rewriting existing bullets over adding new ones.`
    : "";
  const { text } = await generateText({
    model: await modelFor(userId),
    system: `You edit a job seeker's CV to address the gaps below, using only true facts.
${RULES}
Return ONLY a JSON array (no prose), at most 8 items, together covering as many gaps as the facts allow:
[{"action": "replace" | "insert_after", "index": <block number>, "html": "the new block content (plain text, optionally <b> for emphasis)", "reason": "one short sentence: which fact this uses and why it helps"}]
"replace" rewrites block <index>; "insert_after" adds a new bullet after bullet <index> in the same role. Return [] if the answers give nothing usable. Use single quotes inside strings.`,
    prompt: `Gaps to address: ${gaps.join("; ")}\n\nAnswers from the candidate:\n${answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")}\n\nCandidate notes:\n${await candidateNotes(userId)}${ref}\n\nCV blocks (number. [kind | where] html):\n${numbered}`,
    temperature: 0.2,
  });
  const raw = parseJsonBlock<CvEdit[]>(text, "[") ?? [];
  return raw
    .filter((e) => e && (e.action === "replace" || e.action === "insert_after") && Number.isInteger(e.index) && blocks[e.index] && typeof e.html === "string")
    .filter((e) => e.action === "replace" || blocks[e.index].kind === "bullet")
    .slice(0, 8)
    .map((e) => ({
      ...e,
      html: sanitizeInline(e.html),
      before: e.action === "replace" ? blocks[e.index].text : null,
      context: blocks[e.index].context,
    }));
}

/** Step 2: concrete edits to numbered CV blocks, from the answers only. */
export const proposeCvEdits = async (input: {
  gaps: string[];
  trackId: string;
  answers: CvQa[];
}): Promise<{ success: boolean; edits?: ProposedEdit[]; message?: string }> => {
  try {
    const user = await requireUser();
    trackOrThrow(input.trackId);
    const answered = input.answers.filter((a) => a.answer.trim());
    if (!answered.length) return { success: false, message: "Answer at least one question first." };
    return { success: true, edits: await draftEdits(user.id, input.trackId, input.gaps, answered) };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
};

/** Step 3: write the chosen edits, re-render the PDF, keep the facts, re-match. */
export type OtherCvResult = { label: string; applied: number; status: "updated" | "unchanged" | "reverted" | "failed" };

/**
 * Same facts, another CV: drafts the equivalent edits from the ones just
 * made, applies them, and reverts the file if it runs past two pages.
 */
async function updateOtherCv(
  userId: string,
  trackId: string,
  gaps: string[],
  answers: CvQa[],
  reference: { label: string; edits: { before: string | null; after: string; context: string }[] },
): Promise<OtherCvResult> {
  const label = trackOrThrow(trackId).label;
  try {
    const before = readTrackCvHtml(trackId);
    if (!before) return { label, applied: 0, status: "failed" };
    const edits = await draftEdits(userId, trackId, gaps, answers, reference);
    const { html, applied } = applyCvEdits(before, edits);
    if (!applied) return { label, applied: 0, status: "unchanged" };
    writeTrackCvHtml(trackId, html);
    const { pages } = await renderTrackCvPdf(trackId).catch(() => ({ pages: null as number | null }));
    if (pages && pages > CV_MAX_PAGES) {
      restoreTrackCvHtml(trackId, before);
      await renderTrackCvPdf(trackId).catch(() => undefined);
      return { label, applied: 0, status: "reverted" };
    }
    return { label, applied, status: "updated" };
  } catch {
    return { label, applied: 0, status: "failed" };
  }
}

export const applyCvImprovement = async (input: {
  gaps: string[];
  trackId: string;
  edits: CvEdit[];
  answers: CvQa[];
  alsoOthers?: boolean;
}): Promise<{
  success: boolean;
  applied?: number;
  pages?: number | null;
  others?: OtherCvResult[];
  message?: string;
}> => {
  try {
    const user = await requireUser();
    const track = trackOrThrow(input.trackId);
    const html = readTrackCvHtml(input.trackId);
    if (!html) return { success: false, message: "Couldn't read that CV file." };
    const chosen = input.edits.slice(0, 8);
    const blocksBefore = listCvBlocks(html);
    const { html: next, applied } = applyCvEdits(html, chosen);
    if (!applied) return { success: false, message: "No edits to apply." };
    writeTrackCvHtml(input.trackId, next);

    let pages: number | null = null;
    try {
      pages = (await renderTrackCvPdf(input.trackId)).pages;
    } catch {
      // The HTML is saved; the PDF can be rendered by hand.
    }

    // The same facts in the user's other CVs, one at a time.
    const facts = input.answers.filter((a) => a.answer.trim());
    const others: OtherCvResult[] = [];
    if (input.alsoOthers && facts.length) {
      const reference = {
        label: track.label,
        edits: chosen
          .filter((e) => blocksBefore[e.index])
          .map((e) => ({
            before: e.action === "replace" ? blocksBefore[e.index].text : null,
            after: e.html,
            context: blocksBefore[e.index].context,
          })),
      };
      for (const t of loadCvTracks().filter((t) => t.id !== input.trackId)) {
        others.push(await updateOtherCv(user.id, t.id, input.gaps, facts, reference));
      }
    }

    // Keep the facts so later CVs, letters and reviews can use them.
    if (facts.length) {
      const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
      const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
      const add = `\n\nFacts for ${input.gaps.map((g) => `"${g}"`).join(", ")} (${new Date().toISOString().slice(0, 10)}):\n${facts.map((f) => `- ${f.answer.trim()}`).join("\n")}`;
      // Facts get their own field and only the oldest facts are ever dropped;
      // the user's own notes are never touched.
      const factsText = ((settings.candidate?.facts ?? "") + add).slice(-CANDIDATE_FACTS_MAX_CHARS);
      const merged = { ...settings, candidate: { notes: settings.candidate?.notes ?? "", facts: factsText } };
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { settings: JSON.stringify(merged) },
        create: { userId: user.id, settings: JSON.stringify(merged) },
      });
    }

    // Re-match this track's jobs (the CV file changed, so their matches are
    // stale) and rebuild the gaps, in the background.
    if (user.email) startBackgroundRematch(user.email);

    const updated = others.filter((o) => o.status === "updated").map((o) => o.label);
    const reverted = others.filter((o) => o.status === "reverted").map((o) => o.label);
    return {
      success: true,
      applied,
      pages,
      others,
      message: [
        `${track.label} CV updated.`,
        pages && pages > CV_MAX_PAGES ? `It's now ${pages} pages; shorten it before sending.` : "",
        updated.length ? `Also updated: ${updated.join(", ")}.` : "",
        reverted.length ? `Not changed, would have gone past two pages: ${reverted.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
};
