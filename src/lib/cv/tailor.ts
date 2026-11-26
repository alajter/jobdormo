import "server-only";
import { getSearchRulesFor } from "@/lib/search/rules.server";
import path from "path";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { candidateContext, userModel } from "@/lib/people/voice";
import { extractMatchGuidance } from "@/lib/ai/coverLetter/matchGuidance";
import { guessTrack } from "@/models/cvTrack.model";
import { applyCvEdits, keywordCoverage, listCvBlocks, sanitizeInline, strip, type CvBlock, type CvEditOp } from "./cvEdits";
import { saveCandidateFacts } from "./facts";
import { reviewJobCv, type CvIssue } from "./review";
import { CV_MAX_PAGES, loadCvTracks, readCareerKnowledge, readTrackCvHtml, renderHtmlToPdf, writeCvFile } from "./tracks";

// "Tailor CV": a CV (up to two pages) for one job, made from the CV for the job's
// track. The AI rewrites the headline, summary, bullets and skills toward
// what the posting asks for, using only true facts, and the result is saved
// as its own file (CV_DIR/jobs/...) and rendered to PDF.

/** A tailored CV is "ready to send" at this ATS keyword match or above. */
export const ATS_TARGET = 75;

export type TailorChange = { action: string; context: string; before: string | null; after: string | null; reason?: string };

export type TailorResult = {
  // Fact-check of the finished CV; "ready to send" needs no high issues.
  review: CvIssue[];
  // ATS keyword match: share of the posting's keywords found in the CV text.
  ats: { before: number; after: number; keywords: string[]; missing: string[] };
  file: string; // relative to CV_DIR
  pdf: string; // absolute
  pages: number | null;
  track: string;
  trackLabel: string;
  changes: TailorChange[];
};

const RULES = `Rules:
- Their career knowledge (their other CV versions, their LinkedIn profile, their notes and saved facts) is all true and written by them: use any fact from it, always under the same employer and role it belongs to.
- The goal is a high ATS match without lying. Use the posting's exact keywords and phrases (verbatim, same spelling) wherever they truthfully describe their experience: in the headline, summary, bullets and skills.
- Be flexible with wording, never with facts: describe real work in the posting's terms (e.g. "discovery with design partners" can become "customer discovery and user research" if that's what it was; "worked with product and R&D on the roadmap" can become "cross-functional roadmap prioritization"). A keyword is fine when their real experience supports it, even if they never used that word.
- Never invent numbers, names, job titles, employers, customers, tools, certifications, degrees or outcomes, and never claim a skill or domain they don't have. If a keyword isn't true for them, leave it out.
- Follow every rule in their notes (titles to use or avoid, companies or stories never to mention, confidential customer names).
- Never make a non-product role read like a product role: where their title was in Customer Success (or anything else), say what the role was (e.g. "led Customer Success") and that they worked closely with product and R&D. Vague lines like "six years at X building products" are not allowed.
- The headline can use the job's title wording when it fits (e.g. "Senior Product Manager · AI Security"), but role titles in the experience section stay exactly as they are.
- Lead with what this job asks for; shorten or remove what doesn't matter for this role.
- Every line must still read naturally to a human recruiter: full sentences, no keyword lists inside sentences, at most two new keywords per sentence. Keep their real numbers (e.g. "six years") rather than restating them to match the posting.
- Keep the same jobs, titles, employers and dates. Don't move content between roles.
- Plain, specific English. No buzzwords, no em dashes, no programming-language lists.
- It must stay within two pages with comfortable spacing: keep rewrites about as long as the original, at most two new bullets, and remove weak bullets that don't serve this job. Don't pad.
- Keep the Projects section (it shows what they build).`;

function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

type AiEdit = { action: "replace" | "insert_after" | "remove"; index: number; html?: string; reason?: string };

function validEdits(raw: AiEdit[] | undefined, blocks: CvBlock[], max: number): AiEdit[] {
  // A role never loses its last bullet: count bullets per role and refuse
  // the removal that would empty one.
  const left = new Map<string, number>();
  for (const b of blocks) if (b.kind === "bullet") left.set(b.context, (left.get(b.context) ?? 0) + 1);
  const keepsOne = (e: AiEdit) => {
    if (e.action !== "remove") return true;
    const ctx = blocks[e.index].context;
    const n = left.get(ctx) ?? 0;
    if (n <= 1) return false;
    left.set(ctx, n - 1);
    return true;
  };
  return (raw ?? [])
    .filter((e) => e && Number.isInteger(e.index) && blocks[e.index])
    .filter((e) =>
      e.action === "remove"
        ? blocks[e.index].kind === "bullet"
        : (e.action === "replace" || (e.action === "insert_after" && blocks[e.index].kind === "bullet")) &&
          typeof e.html === "string" &&
          !!sanitizeInline(e.html),
    )
    .filter(keepsOne)
    .slice(0, max);
}

const toOps = (edits: AiEdit[]): CvEditOp[] =>
  edits.map((e) =>
    e.action === "remove" ? { action: "remove", index: e.index } : { action: e.action, index: e.index, html: e.html! },
  );

const toChanges = (edits: AiEdit[], blocks: CvBlock[]): TailorChange[] =>
  edits.map((e) => ({
    action: e.action,
    context: blocks[e.index].context,
    before: e.action === "insert_after" ? null : blocks[e.index].text,
    after: e.action === "remove" ? null : strip(sanitizeInline(e.html ?? "")),
    reason: e.reason,
  }));

export async function postingKeywords(model: Awaited<ReturnType<typeof userModel>>, title: string, posting: string): Promise<string[]> {
  const { text } = await generateText({
    model,
    system: `You are an ATS (applicant tracking system). From a job posting, list the 15 to 25 keywords and short phrases an ATS would match a CV against: required and preferred skills, domains, methods, tools and the job title terms. Use the posting's exact wording, 1 to 4 words each, most important first.
Skip: soft fluff ("team player"), benefits, company facts, the company's own product names, years-of-experience phrases ("5+ years"), and anything that only makes sense inside a sentence. Split slashed pairs into the single most common term ("first/sole PM" -> "first PM"). Return ONLY a JSON object: {"keywords": ["..."]}`,
    prompt: `Job title: ${title}\n\nPosting:\n${posting}`,
    temperature: 0,
  });
  const k = parseJson<{ keywords?: unknown[] }>(text)?.keywords ?? [];
  return [...new Set(k.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 60)))].slice(0, 25);
}

const numbered = (blocks: CvBlock[]) => blocks.map((b) => `${b.index}. [${b.kind} | ${b.context}] ${b.html}`).join("\n");

const slug = (s: string, words = 4) =>
  s
    .replace(/\(.*?\)/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, words)
    .join("_");

export type TailorFact = { keyword: string; answer: string };

export async function tailorCvForJob(
  userId: string,
  jobId: string,
  opts: { instructions?: string; facts?: TailorFact[] } = {},
): Promise<TailorResult> {
  const { instructions } = opts;
  const atsTarget = (await getSearchRulesFor(userId)).atsTarget;
  const facts = (opts.facts ?? [])
    .filter((f) => f && typeof f.keyword === "string" && typeof f.answer === "string" && f.answer.trim())
    .slice(0, 25)
    .map((f) => ({ keyword: f.keyword.trim().slice(0, 80), answer: f.answer.trim().slice(0, 800) }));
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: { JobTitle: true, Company: true, Location: true },
  });
  if (!job) throw new Error("Job not found.");
  const tracks = loadCvTracks();
  if (!tracks.length) throw new Error("No CV files found. Set CV_DIR and add tracks.json.");
  const trackId =
    (job.track && tracks.some((t) => t.id === job.track) ? job.track : null) ??
    guessTrack(job.JobTitle.label, job.Company.areas ?? [], tracks.map((t) => t.id)) ??
    tracks[0].id;
  const track = tracks.find((t) => t.id === trackId)!;
  const base = readTrackCvHtml(trackId);
  if (!base) throw new Error(`Couldn't read the ${track.label} CV.`);

  const blocks = listCvBlocks(base);
  // Facts they just confirmed are saved first, so this run and every later CV,
  // letter and match can use them.
  if (facts.length) {
    await saveCandidateFacts(
      userId,
      `Facts confirmed while tailoring for ${job.JobTitle.label} at ${job.Company.label}`,
      facts.map((f) => `${f.keyword}: ${f.answer}`),
    );
  }
  const { notes } = await candidateContext(userId);
  // Every CV version and their LinkedIn text, minus AI-tailored CVs (so a
  // rewording never snowballs from one job's CV into the next).
  const tailored = await prisma.job.findMany({
    where: { userId, tailoredCv: { not: null } },
    select: { tailoredCv: true },
  });
  const knowledge = readCareerKnowledge(tailored.map((j) => j.tailoredCv!).filter(Boolean));
  const confirmed = facts.length
    ? `\nHe just confirmed these about themselves (true; work each keyword in verbatim where it fits):\n${facts.map((f) => `- ${f.keyword}: ${f.answer}`).join("\n")}\n`
    : "";
  const guidance = extractMatchGuidance(job.matchData);
  const posting = job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
  const headlineMatch = /<p class="headline">([\s\S]*?)<\/p>/.exec(base);
  const model = await userModel(userId);
  // The job's stored ATS keywords when it has them, so the score here and the
  // one in the jobs table measure the same thing.
  let keywords: string[] = [];
  try {
    const stored = job.atsKeywords ? JSON.parse(job.atsKeywords) : null;
    if (Array.isArray(stored) && stored.length) keywords = stored.filter((k: unknown) => typeof k === "string");
  } catch {
    keywords = [];
  }
  if (!keywords.length) keywords = await postingKeywords(model, job.JobTitle.label, posting);
  const before = keywordCoverage(base, keywords);

  const { text } = await generateText({
    model,
    system: `You tailor a job seeker's CV (at most two pages) to one job posting.
${RULES}
Return ONLY a JSON object (no prose):
{"headline": "new headline line or null to keep it", "skipped": ["keywords you left out because they aren't true for them"], "edits": [{"action": "replace" | "insert_after" | "remove", "index": <block number>, "html": "new block content (plain text, optionally <b>), omit for remove", "reason": "one short sentence"}]}
"replace" rewrites block <index>; "insert_after" adds a bullet after bullet <index> in the same role; "remove" deletes bullet <index>. At most 14 edits. Always rewrite the summary for this role. Use single quotes inside strings.`,
    prompt: `The job: ${job.JobTitle.label} at ${job.Company.label}${job.Location?.label ? ` (${job.Location.label})` : ""}
${job.Company.description ? `About the company: ${job.Company.description}\n` : ""}Posting: ${posting}
${guidance ? `\nEarlier match analysis (what to emphasise; not a source of facts):\n${guidance}\n` : ""}${confirmed}${instructions?.trim() ? `\nThe candidate's instructions for this version: ${instructions.trim().slice(0, 1000)}\n` : ""}
ATS keywords from the posting (use each verbatim wherever it's true for them):
${keywords.join(" · ")}
Already in their CV: ${keywords.filter((k) => !before.missing.includes(k)).join(" · ") || "none"}
Missing now: ${before.missing.join(" · ") || "none"}

Candidate notes (true facts and rules):
${notes}

Their career knowledge (true; source of facts):
${knowledge}

Current headline: ${headlineMatch ? headlineMatch[1].replace(/<[^>]+>/g, "") : "(none)"}

CV blocks (number. [kind | where] html):
${numbered(blocks)}`,
    temperature: 0.2,
  });
  const plan = parseJson<{ headline?: string | null; edits?: AiEdit[] }>(text);
  if (!plan) throw new Error("The AI didn't return usable edits. Try again.");
  const edits = validEdits(plan.edits, blocks, 14);

  let html = applyCvEdits(base, toOps(edits)).html;
  const headline = plan.headline ? sanitizeInline(plan.headline) : "";
  if (headline && headlineMatch) html = html.replace(headlineMatch[0], `<p class="headline">${headline}</p>`);
  const changes = toChanges(edits, blocks);
  if (headline && headlineMatch) {
    changes.unshift({ action: "replace", context: "Headline", before: strip(headlineMatch[1]), after: strip(headline) });
  }

  // Second pass: go after the keywords still missing, one by one. Many are
  // true for them in other words (e.g. "developer background" for someone who
  // started as a software engineer); those get worked in verbatim.
  // Up to two passes while it's below the ATS target.
  for (let pass = 0; pass < 2; pass++) {
  const cov = keywordCoverage(html, keywords);
  const stillMissing = cov.missing;
  if (!stillMissing.length || (pass > 0 && cov.score >= atsTarget)) break;
  {
    const cur = listCvBlocks(html);
    const { text: fill } = await generateText({
      model,
      system: `You raise a tailored CV's ATS keyword match without lying. ${RULES}
For each missing keyword decide: is it TRUE for them given their CV and notes, even if they never used that word? If yes, work it in verbatim (exact spelling) by rewriting the block where it fits best, keeping the block about the same length. If no (a domain, tool, method or credential they don't have), skip it.
Return ONLY a JSON object: {"edits": [{"action": "replace", "index": <n>, "html": "...", "reason": "which keyword and why it's true"}], "skipped": ["keywords that aren't true for them"]}. Use single quotes inside strings.`,
      prompt: `The job: ${job.JobTitle.label} at ${job.Company.label}
Missing keywords: ${stillMissing.join(" · ")}
${confirmed}
Candidate notes (true facts and rules):
${notes}

Their career knowledge (true; source of facts):
${knowledge}

CV blocks (number. [kind | where] html):
${numbered(cur)}`,
      temperature: 0.1,
    });
    const extra = validEdits(parseJson<{ edits?: AiEdit[] }>(fill)?.edits, cur, 10).filter((e) => e.action === "replace");
    if (!extra.length) break;
    html = applyCvEdits(html, toOps(extra)).html;
    changes.push(...toChanges(extra, cur));
  }
  }

  const prefix = path.basename(track.file, ".html").split("_").slice(0, 2).join("_") || "CV";
  // Job-specific CVs live in jobs/, the generic ones in generic/.
  const rel = `jobs/${prefix}_${slug(job.Company.label, 3)}_${slug(job.JobTitle.label)}.html`;
  const abs = writeCvFile(rel, html);
  let { pdf, pages } = await renderHtmlToPdf(abs);

  // Over two pages: ask for cuts (shorter bullets, removed weak ones) and try again.
  for (let attempt = 0; attempt < 2 && pages !== null && pages > CV_MAX_PAGES; attempt++) {
    const cur = listCvBlocks(html);
    const { text: fix } = await generateText({
      model,
      system: `This tailored CV runs past ${CV_MAX_PAGES} pages and must fit in ${CV_MAX_PAGES}. ${RULES}
Return ONLY a JSON object: {"edits": [{"action": "replace" | "remove", "index": <n>, "html": "shorter text (omit for remove)"}]}. Cut about ${attempt === 0 ? "six" : "ten"} lines: shorten long bullets and remove the bullets that matter least for this job. Keep these ATS keywords in the text: ${keywords.join(", ")}. Never remove a role's only bullet.`,
      prompt: `The job: ${job.JobTitle.label} at ${job.Company.label}\n\nCV blocks (number. [kind | where] html):\n${numbered(cur)}`,
      temperature: 0.1,
    });
    const cut = validEdits(parseJson<{ edits?: AiEdit[] }>(fix)?.edits, cur, 16).filter((e) => e.action !== "insert_after");
    if (!cut.length) break;
    html = applyCvEdits(html, toOps(cut)).html;
    changes.push(...toChanges(cut, cur).map((c) => ({ ...c, reason: c.reason ?? "to keep it within two pages" })));
    writeCvFile(rel, html);
    ({ pdf, pages } = await renderHtmlToPdf(abs));
  }

  await prisma.job.updateMany({
    where: { id: job.id, userId },
    data: {
      tailoredCv: rel,
      atsKeywords: JSON.stringify(keywords),
      atsBase: before.score,
      atsTailored: keywordCoverage(html, keywords).score,
      atsCheckedAt: new Date(),
    },
  });
  await prisma.note.create({
    data: {
      jobId: job.id,
      userId,
      content: `${new Date().toISOString().slice(0, 10)}: tailored CV created from the ${track.label} CV (${changes.length} changes, ATS keyword match ${before.score}% → ${keywordCoverage(html, keywords).score}%${pages && pages > CV_MAX_PAGES ? `, ${pages} pages` : ""}): ${path.basename(pdf)}`,
    },
  });
  const after = keywordCoverage(html, keywords);
  const review = (await reviewJobCv(userId, job.id).catch(() => null)) ?? [];
  return {
    review,
    ats: { before: before.score, after: after.score, keywords, missing: after.missing },
    file: rel,
    pdf,
    pages,
    track: trackId,
    trackLabel: track.label,
    changes,
  };
}
