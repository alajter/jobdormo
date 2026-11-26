import "server-only";
import { readFileSync } from "fs";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { candidateContext, userModel } from "@/lib/people/voice";
import { applyCvEdits, listCvBlocks, sanitizeInline, strip } from "./cvEdits";
import { cvPath, readCareerKnowledge, readTrackCvHtml, renderHtmlToPdf, writeCvFile } from "./tracks";

// CV review: checks a tailored CV before it's sent. Deterministic checks
// (role titles, employers, dates and contact line must match the generic CV
// it came from) plus an AI fact-check against everything the user has
// written about their career and their rules. Each issue carries the exact
// quote and a suggested fix that can be applied with one click.

export type CvIssue = {
  severity: "high" | "medium" | "low";
  kind: string; // e.g. unsupported-claim, wrong-term, rule, exaggeration, inconsistency, wording, structure
  quote: string; // exact text from the CV
  problem: string;
  fix: string | null; // replacement for the quote, or null when it should be removed / can't be fixed by text
};

const plainLines = (html: string) =>
  strip(html.replace(/<head>[\s\S]*?<\/head>/i, " ").replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(li|p|div|h\d|tr)>/gi, "\n"))
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

// "<rtitle> · <co> ... | dates" for each role, in order.
function roleHeaders(html: string): string[] {
  const out: string[] = [];
  const re = /<div class="rhead">([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(strip(m[1]).replace(/\s+/g, " "));
  return out;
}

const contactLine = (html: string) => strip(/<p class="contact">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");

/** Facts that must not change between the generic CV and a tailored one. */
export function structuralIssues(base: string, tailored: string): CvIssue[] {
  const issues: CvIssue[] = [];
  const a = roleHeaders(base);
  const b = roleHeaders(tailored);
  for (const h of b) {
    if (!a.includes(h)) {
      issues.push({
        severity: "high",
        kind: "structure",
        quote: h,
        problem: "This role header (title, employer or dates) differs from your generic CV. Titles, employers and dates must not change.",
        fix: null,
      });
    }
  }
  for (const h of a) {
    if (!b.includes(h) && !issues.some((i) => i.quote === h)) {
      const missing = !b.some((x) => x.split(" · ")[1] && h.includes(x.split(" · ")[1]));
      if (missing) {
        issues.push({ severity: "medium", kind: "structure", quote: h, problem: "This role is missing from the tailored CV.", fix: null });
      }
    }
  }
  if (contactLine(base) && contactLine(base) !== contactLine(tailored)) {
    issues.push({ severity: "high", kind: "structure", quote: contactLine(tailored), problem: "The contact line changed.", fix: contactLine(base) });
  }
  return issues;
}

function parseIssues(text: string): CvIssue[] {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return [];
  try {
    const j = JSON.parse(text.slice(s, e + 1));
    return (Array.isArray(j.issues) ? j.issues : [])
      .filter((i: CvIssue) => i && typeof i.quote === "string" && i.quote.trim() && typeof i.problem === "string")
      .map((i: CvIssue) => ({
        severity: i.severity === "high" || i.severity === "low" ? i.severity : "medium",
        kind: String(i.kind || "issue").slice(0, 40),
        quote: i.quote.trim().slice(0, 600),
        problem: i.problem.trim().slice(0, 600),
        fix: typeof i.fix === "string" && i.fix.trim() ? i.fix.trim().slice(0, 1200) : null,
      }));
  } catch {
    return [];
  }
}

/** AI fact-check of a CV's text against the user's career knowledge and rules. */
export async function aiReview(userId: string, cvHtml: string, posting: string, exclude: string[], keywords: string[] = []): Promise<CvIssue[]> {
  const { notes } = await candidateContext(userId);
  const knowledge = readCareerKnowledge(exclude);
  const cv = plainLines(cvHtml).join("\n");
  const { text } = await generateText({
    model: await userModel(userId),
    system: `You are a strict fact-checker and experienced hiring manager reviewing a job seeker's CV before they send it. Find what would embarrass them or cost them the job. Check:
- unsupported-claim: anything not backed by their career knowledge or notes (e.g. contributions, numbers, scope, titles, customers, tools).
- exaggeration: a real fact stretched (bigger scope, a title they didn't hold, "led" where they "worked with", a product role at a company where they were in Customer Success).
- wrong-term: technical or domain terms used wrongly (e.g. calling Ollama or OpenRouter "model suppliers": Ollama runs open models locally, OpenRouter routes to many providers; only Anthropic, OpenAI, Google and similar make and sell models).
- rule: anything that breaks their notes (things never to make public or claim, credit they asked not to claim, titles to avoid, confidential customers).
- inconsistency: contradictions inside the CV (dates, numbers, duplicated or conflicting facts).
- wording: keyword stuffing, unnatural or clumsy sentences a recruiter would notice, personal details that don't belong on a CV.
Severity: high = untrue, a rule break, or misused technical term; medium = stretched or likely to be questioned; low = wording.
For each issue: "quote" is the exact text copied from the CV (a whole sentence or phrase, verbatim), "fix" is the replacement text for that quote that is true and keeps the useful keywords, or null to delete it.
The posting's ATS keywords matter for getting past screening: when a keyword is TRUE for them, keep it verbatim in your fix (reword around it instead of deleting it). Never flag a true keyword just for repetition.
Only report real problems; an empty list is fine. Return ONLY JSON: {"issues": [{"severity","kind","quote","problem","fix"}]}. Use single quotes inside strings.`,
    prompt: `Job posting (context for what's being optimised):\n${posting.slice(0, 3000)}\n${keywords.length ? `\nATS keywords to keep where true: ${keywords.join(" · ")}\n` : ""}\nHis notes, rules and confirmed facts:\n${notes}\n\nHis career knowledge (their own CV versions and LinkedIn text):\n${knowledge}\n\nThe CV to review:\n${cv}`,
    temperature: 0,
  });
  return parseIssues(text);
}

/** Reviews a job's tailored CV and stores the result on the job. */
export async function reviewJobCv(userId: string, jobId: string): Promise<CvIssue[] | null> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, tailoredCv: true, track: true, description: true, atsKeywords: true },
  });
  const p = job?.tailoredCv ? cvPath(job.tailoredCv) : null;
  if (!job || !p) return null;
  const html = readFileSync(p, "utf8");
  const base = job.track ? readTrackCvHtml(job.track) : null;
  const tailored = await prisma.job.findMany({ where: { userId, tailoredCv: { not: null } }, select: { tailoredCv: true } });
  const posting = job.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const issues = [
    ...(base ? structuralIssues(base, html) : []),
    ...(await aiReview(userId, html, posting, tailored.map((t) => t.tailoredCv!), (() => {
      try {
        return job.atsKeywords ? (JSON.parse(job.atsKeywords) as string[]) : [];
      } catch {
        return [];
      }
    })())),
  ];
  // Keep only issues whose quote is really in the CV (or structural ones).
  const text = plainLines(html).join(" ").replace(/\s+/g, " ");
  const kept = issues.filter((i) => i.kind === "structure" || text.includes(i.quote.replace(/\s+/g, " ")));
  await prisma.job.updateMany({
    where: { id: job.id, userId },
    data: { cvReview: JSON.stringify(kept), cvReviewedAt: new Date() },
  });
  return kept;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

/**
 * Replaces a piece of *visible* text anywhere in the body of an HTML page
 * (a bullet, a date line, a role header, skills), even when it spans tags or
 * entities: builds the visible text with a map back to HTML offsets, finds
 * the quote (whitespace-insensitive), and swaps that HTML span for the new
 * text. Returns null when the quote isn't on the page.
 */
export function replaceVisibleText(html: string, quote: string, replacement: string): string | null {
  const bodyStart = Math.max(0, html.search(/<body[^>]*>/i));
  const text: string[] = [];
  const map: number[] = [];
  let i = bodyStart;
  let lastSpace = true;
  while (i < html.length) {
    const ch = html[i];
    if (ch === "<") {
      const close = html.indexOf(">", i);
      const tag = html.slice(i, close + 1).toLowerCase();
      if (/^<(style|script)/.test(tag)) {
        const end = html.toLowerCase().indexOf(tag.startsWith("<style") ? "</style>" : "</script>", i);
        i = end < 0 ? html.length : end + 9;
        continue;
      }
      i = close < 0 ? html.length : close + 1;
      // Block tags separate words; inline tags (b, i, a, span…) don't.
      const name = /^<\/?([a-z0-9]+)/.exec(tag)?.[1] ?? "";
      const block = /^(p|div|li|ul|ol|br|td|th|tr|table|h[1-6]|section|header|footer)$/.test(name);
      if (block && !lastSpace) {
        text.push(" ");
        map.push(i);
        lastSpace = true;
      }
      continue;
    }
    if (ch === "&") {
      const m = /^&[#a-z0-9]+;/i.exec(html.slice(i, i + 10));
      if (m) {
        const v = ENTITIES[m[0]] ?? " ";
        text.push(v);
        map.push(i);
        lastSpace = /\s/.test(v);
        i += m[0].length;
        continue;
      }
    }
    if (/\s/.test(ch)) {
      if (!lastSpace) {
        text.push(" ");
        map.push(i);
        lastSpace = true;
      }
      i++;
      continue;
    }
    text.push(ch);
    map.push(i);
    lastSpace = false;
    i++;
  }
  const plain = text.join("");
  const q = quote.replace(/\s+/g, " ").trim();
  const at = plain.indexOf(q);
  if (at < 0) return null;
  const start = map[at];
  const lastIdx = at + q.length - 1;
  // End just after the last character (or the whole entity) of the quote.
  let end = map[lastIdx] + 1;
  if (html[map[lastIdx]] === "&") end = html.indexOf(";", map[lastIdx]) + 1;
  const safe = replacement.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return html.slice(0, start) + safe + html.slice(end);
}

/**
 * Applies one issue's fix to the job's tailored CV: replaces the quote inside
 * the block that contains it (or removes the sentence), re-renders the PDF.
 */
export async function applyCvFix(userId: string, jobId: string, issue: Pick<CvIssue, "quote" | "fix">): Promise<boolean> {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId }, select: { tailoredCv: true, cvReview: true } });
  const p = job?.tailoredCv ? cvPath(job.tailoredCv) : null;
  if (!job?.tailoredCv || !p) return false;
  const html = readFileSync(p, "utf8");
  const quote = issue.quote.replace(/\s+/g, " ").trim();
  // Best case: the quote is plain text in the HTML, so replace it in place
  // and keep links and bold around it.
  const enc = (s: string) => s.replace(/&/g, "&amp;");
  const anywhere = html.includes(enc(quote)) ? null : replaceVisibleText(html, quote, issue.fix ?? "");
  if (anywhere) {
    const abs = writeCvFile(job.tailoredCv, anywhere);
    await renderHtmlToPdf(abs);
    await dropIssue(userId, jobId, job.cvReview, issue.quote);
    return true;
  }
  if (html.includes(enc(quote))) {
    const out = html.replace(enc(quote), issue.fix ? sanitizeInline(enc(issue.fix)) : "");
    const abs = writeCvFile(job.tailoredCv, out);
    await renderHtmlToPdf(abs);
    await dropIssue(userId, jobId, job.cvReview, issue.quote);
    return true;
  }
  const block = listCvBlocks(html).find((b) => b.text.replace(/\s+/g, " ").includes(quote));
  if (!block) return false;
  const newText = block.text.replace(/\s+/g, " ").replace(quote, issue.fix ?? "").replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
  const ops =
    newText.replace(/[.\s]/g, "") === ""
      ? block.kind === "bullet"
        ? [{ action: "remove" as const, index: block.index }]
        : []
      : [{ action: "replace" as const, index: block.index, html: sanitizeInline(newText.replace(/&/g, "&amp;")) }];
  if (!ops.length) return false;
  const out = applyCvEdits(html, ops).html;
  const abs = writeCvFile(job.tailoredCv, out);
  await renderHtmlToPdf(abs);
  await dropIssue(userId, jobId, job.cvReview, issue.quote);
  return true;
}

async function dropIssue(userId: string, jobId: string, stored: string | null, quote: string) {
  try {
    const list: CvIssue[] = stored ? JSON.parse(stored) : [];
    const rest = list.filter((i) => i.quote !== quote);
    await prisma.job.updateMany({ where: { id: jobId, userId }, data: { cvReview: JSON.stringify(rest) } });
  } catch {
    // review list unreadable: leave it
  }
}
