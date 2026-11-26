// Pure helpers for "Improve my CV": number the editable blocks of an HTML CV
// (summary paragraph, bullets, skills cells) so the model can reference them
// by index, and apply its edits back to the HTML. Client-safe, no IO.

export type CvBlock = {
  index: number;
  kind: "summary" | "bullet" | "skill";
  html: string;
  text: string;
  // Where it sits: the role/company heading for bullets, the label for skills.
  context: string;
};

export type CvEdit =
  | { action: "replace"; index: number; html: string; reason?: string }
  | { action: "insert_after"; index: number; html: string; reason?: string };

// What applyCvEdits accepts: the AI's edits plus removing a bullet (used by
// "Tailor CV" to keep a job's CV on one page).
export type CvEditOp = CvEdit | { action: "remove"; index: number; reason?: string };

const BLOCK_RE = /<li>([\s\S]*?)<\/li>|(<h2>SUMMARY<\/h2>\s*<p>)([\s\S]*?)(<\/p>)|<td>([\s\S]*?)<\/td>/g;

export const strip = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// The nearest heading before a block: a sub-entry tag (<p class="tag"><b>X</b>),
// a role (<span class="rtitle">T</span> · <span class="co">C</span>), or a
// skill row label (<td class="k">L</td>).
function contextBefore(html: string, pos: number, kind: CvBlock["kind"]): string {
  const before = html.slice(0, pos);
  if (kind === "summary") return "Summary";
  if (kind === "skill") {
    const k = [...before.matchAll(/<td class="k">([\s\S]*?)<\/td>/g)].pop();
    return k ? `Skills: ${strip(k[1])}` : "Skills";
  }
  const role = [...before.matchAll(/<span class="rtitle">([\s\S]*?)<\/span>[\s\S]*?<span class="co">([\s\S]*?)<\/span>/g)].pop();
  const tag = [...before.matchAll(/<p class="tag"><b>([\s\S]*?)<\/b>/g)].pop();
  const roleText = role ? `${strip(role[1])} · ${strip(role[2])}` : "";
  // A sub-entry tag counts only if it comes after the last role heading.
  if (tag && (!role || (tag.index ?? 0) > (role.index ?? 0))) return `${roleText} › ${strip(tag[1])}`;
  return roleText || "Experience";
}

export function listCvBlocks(html: string): CvBlock[] {
  const blocks: CvBlock[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(html))) {
    const [, li, , summary, , td] = m;
    const inner = li ?? summary ?? td ?? "";
    const kind = li !== undefined ? "bullet" : summary !== undefined ? "summary" : "skill";
    blocks.push({ index: blocks.length, kind, html: inner, text: strip(inner), context: contextBefore(html, m.index, kind) });
  }
  return blocks;
}

/**
 * Applies edits by block index. Replacements swap a block's inner HTML;
 * insert_after adds a new <li> after a bullet. Unknown indexes and inserts
 * after non-bullets are skipped. Returns the new HTML and what was applied.
 */
export function applyCvEdits(html: string, edits: CvEditOp[]): { html: string; applied: number } {
  const blocks = listCvBlocks(html);
  // Walk matches again to know each block's position in the string.
  const spans: { start: number; end: number; inner: [number, number]; kind: CvBlock["kind"] }[] = [];
  let m: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((m = BLOCK_RE.exec(html))) {
    const full = m[0];
    const inner = m[1] ?? m[3] ?? m[5] ?? "";
    const offsetInFull = m[1] !== undefined ? 4 : m[3] !== undefined ? (m[2]?.length ?? 0) : 4;
    const start = m.index;
    spans.push({ start, end: start + full.length, inner: [start + offsetInFull, start + offsetInFull + inner.length], kind: blocks[spans.length].kind });
  }
  // Apply from the end so earlier offsets stay valid.
  // On the same block, insert after it before replacing it: the insert uses
  // the block's original end, which a replacement of a different length
  // would make stale (the new bullet then lands inside the rewritten text).
  const sorted = [...edits]
    .filter((e) => spans[e.index])
    .sort((a, b) => b.index - a.index || (a.action === "insert_after" ? -1 : 0) - (b.action === "insert_after" ? -1 : 0));
  let out = html;
  let applied = 0;
  for (const e of sorted) {
    const s = spans[e.index];
    if (e.action === "remove") {
      if (s.kind !== "bullet") continue;
      // Take the bullet's own line (indent and newline) with it.
      let start = s.start;
      while (start > 0 && out[start - 1] === " ") start--;
      if (start > 0 && out[start - 1] === "\n") start--;
      out = out.slice(0, start) + out.slice(s.end);
      applied++;
      continue;
    }
    const clean = sanitizeInline(e.html);
    if (!clean) continue;
    if (e.action === "replace") {
      out = out.slice(0, s.inner[0]) + clean + out.slice(s.inner[1]);
      applied++;
    } else if (e.action === "insert_after" && s.kind === "bullet") {
      out = out.slice(0, s.end) + `\n    <li>${clean}</li>` + out.slice(s.end);
      applied++;
    }
  }
  return { html: out, applied };
}

// Only plain text and simple inline tags may go into a CV block.
export function sanitizeInline(html: string): string {
  return html
    .replace(/<(?!\/?(b|i|a)(\s+href="https?:\/\/[^"]*")?\s*>)[^>]*>/gi, "")
    .replace(/&(?!(amp|lt|gt|quot|#39);)/g, "&amp;")
    .trim();
}

const plainCvText = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Share (0-100) of keywords found in the CV text, and which ones are missing. */
export function keywordCoverage(html: string, keywords: string[]): { score: number; missing: string[] } {
  if (!keywords.length) return { score: 0, missing: [] };
  const text = plainCvText(html);
  const missing = keywords.filter((k) => !text.includes(k.toLowerCase()));
  return { score: Math.round(((keywords.length - missing.length) / keywords.length) * 100), missing };
}
