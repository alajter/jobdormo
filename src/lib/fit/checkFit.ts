import "server-only";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { candidateContext, userModel } from "@/lib/people/voice";
import { postingKeywords } from "@/lib/cv/tailor";
import { keywordCoverage } from "@/lib/cv/cvEdits";
import { loadCvTracks, readTrackCvHtml } from "@/lib/cv/tracks";
import { guessTrack } from "@/models/cvTrack.model";
import { normalizeCompany } from "@/models/people.model";
import { isBigCompany, isJuniorCsRole } from "@/lib/focus";
import { fitFlags, type FitCheck, type FitVerdict } from "./fitRules";

// "Does this position fit me?" for a pasted posting, before it goes on the
// board: what it is, the hard checks (office, size, level, who you know,
// already on the board, ATS of the generic CV), and a judgment of each
// requirement against the owner's CV and notes. Nothing is saved here.

function parseJson<T>(text: string): T | null {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1)) as T;
  } catch {
    return null;
  }
}

type Extracted = {
  company?: string;
  title?: string;
  location?: string;
  workplace?: string;
  size?: string;
  about?: string;
  areas?: string[];
  requirements?: { text?: string; must?: boolean }[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function checkFit(userId: string, posting: string): Promise<FitCheck> {
  const text = posting.trim().slice(0, 20000);
  const model = await userModel(userId);

  // 1. What the posting is.
  const { text: rawFacts } = await generateText({
    model,
    system: `Read a job posting (often pasted from LinkedIn with page noise around it) and extract facts. Use only what the text says; leave a field empty when it isn't there.
Return ONLY JSON: {"company":"","title":"","location":"city, country as written","workplace":"onsite|hybrid|remote|","size":"employees as written, e.g. 51-200 or 732","about":"one sentence: what the company does","areas":["security|ai|devtools|data|fintech|health|martech|defense|other"],"requirements":[{"text":"one requirement, short, in the posting's words","must":true}]}
Requirements: 6 to 12, the real ones (skills, experience, domain), "must": false for nice-to-haves. Skip perks and boilerplate. Use single quotes inside strings.`,
    prompt: text,
    temperature: 0,
  });
  const x = parseJson<Extracted>(rawFacts) ?? {};
  const company = str(x.company, 120) || "Unknown company";
  const title = str(x.title, 200) || "Unknown role";
  const location = str(x.location, 120);
  const workplace = str(x.workplace, 20).toLowerCase();
  const size = str(x.size, 40);
  const areas = Array.isArray(x.areas) ? x.areas.filter((a): a is string => typeof a === "string").slice(0, 4) : [];
  const requirements = (Array.isArray(x.requirements) ? x.requirements : [])
    .map((r) => ({ text: str(r?.text, 240), must: r?.must !== false }))
    .filter((r) => r.text)
    .slice(0, 12);

  // 2. Hard checks, in parallel with the keyword extraction.
  const tracks = loadCvTracks();
  const track = guessTrack(title, areas, tracks.map((t) => t.id));
  const key = normalizeCompany(company);
  const [keywords, contacts, board, ctx] = await Promise.all([
    postingKeywords(model, title, text).catch(() => [] as string[]),
    prisma.contact.findMany({
      where: { createdBy: userId, OR: [{ companyName: { not: null } }, { companyId: { not: null } }] },
      select: { name: true, title: true, companyName: true, Company: { select: { label: true } } },
    }),
    prisma.job.findMany({
      where: { userId },
      select: { id: true, Status: { select: { label: true } }, JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
    }),
    candidateContext(userId),
  ]);
  const known = key
    ? contacts
        .filter((c) => normalizeCompany(c.Company?.label ?? c.companyName ?? "") === key)
        .slice(0, 8)
        .map((c) => ({ name: c.name, title: c.title }))
    : [];
  const onBoard = board.find((j) => normalizeCompany(j.Company.label) === key && key) ?? null;
  const html = track ? readTrackCvHtml(track) : null;
  const ats = html && keywords.length ? keywordCoverage(html, keywords) : null;

  // 3. Each requirement against their CV and notes, and a verdict.
  const { text: rawJudgment } = await generateText({
    model,
    system: `You judge whether a job is worth applying to for this candidate, honestly. Use only facts from their CV and notes; never assume experience they don't show. Follow their notes (what they want, what they avoid, how to describe their background).
For each requirement: "met" (clear evidence), "partial" (adjacent evidence), or "missing". Evidence: a few words pointing to where in their CV, or why it's missing.
Verdict: "apply" (most musts met, worth tailoring now), "long_shot" (a core must is partial or missing, worth it only through a person or if it's a dream role), or "skip" (wrong role, level or direction for them).
Return ONLY JSON: {"verdict":"apply|long_shot|skip","summary":"one or two plain sentences","whyApply":["short reason"],"whyNot":["short reason"],"requirements":[{"text":"","status":"met|partial|missing","evidence":""}]}
Keep the requirements in the order given. 2 to 5 reasons each side. Use single quotes inside strings.`,
    prompt: `Job: ${title} at ${company}${location ? `, ${location}` : ""}${workplace ? ` (${workplace})` : ""}${size ? `, ${size} employees` : ""}.
${str(x.about, 300) ? `Company: ${str(x.about, 300)}\n` : ""}
Requirements:
${requirements.map((r, i) => `${i + 1}. ${r.must ? "" : "(nice to have) "}${r.text}`).join("\n")}

Their notes and rules:
${ctx.notes}

Their CV:
${ctx.cv.slice(0, 9000)}

Posting (for context):
${text.slice(0, 6000)}`,
    temperature: 0.2,
  });
  const j = parseJson<{ verdict?: string; summary?: string; whyApply?: unknown[]; whyNot?: unknown[]; requirements?: { text?: string; status?: string; evidence?: string }[] }>(rawJudgment) ?? {};
  const verdict: FitVerdict = j.verdict === "apply" || j.verdict === "skip" ? j.verdict : "long_shot";
  const list = (v: unknown[] | undefined) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 300)).slice(0, 6) : []);

  const flags = fitFlags({ location, workplace, size, title, big: isBigCompany(size), juniorCs: isJuniorCsRole(title) });
  return {
    company,
    title,
    location,
    workplace,
    size,
    about: str(x.about, 300),
    track,
    trackLabel: tracks.find((t) => t.id === track)?.label ?? null,
    ats: ats ? { score: ats.score, missing: ats.missing.slice(0, 10) } : null,
    known,
    onBoard: onBoard ? { jobId: onBoard.id, status: onBoard.Status.label, title: onBoard.JobTitle.label } : null,
    verdict: flags.hard && verdict === "apply" ? "long_shot" : verdict,
    summary: str(j.summary, 500),
    whyApply: list(j.whyApply),
    whyNot: [...flags.reasons, ...list(j.whyNot)],
    requirements: (Array.isArray(j.requirements) ? j.requirements : [])
      .map((r, i) => ({
        text: str(r?.text, 240) || requirements[i]?.text || "",
        status: (r?.status === "met" ? "met" : r?.status === "missing" ? "missing" : "partial") as FitCheck["requirements"][number]["status"],
        evidence: str(r?.evidence, 240),
      }))
      .filter((r) => r.text),
  };
}
