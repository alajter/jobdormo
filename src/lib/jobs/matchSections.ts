// Splits the stored AI match analysis (markdown with "## Summary",
// "## Requirements" with **Met** / **Partial** / **Missing**, "## Skills",
// "## Deal Breakers", "## Tailoring Tips"...) into parts the job page can
// lay out. Pure and client-safe; anything it doesn't recognise is ignored,
// and the full text stays available on the page.

export type FitItem = { label: string; detail: string };

export type MatchSections = {
  summary: string;
  met: FitItem[];
  partial: FitItem[];
  missing: FitItem[];
  skills: { matched: string; transferable: string; missing: string; bonus: string };
  experience: string;
  dealBreakers: string;
  tips: FitItem[];
};

const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

/** "Label: detail" → {label, detail}; a line without a colon is all detail. */
export function splitItem(line: string): FitItem {
  const text = clean(line.replace(/^\s*[-*]\s+/, ""));
  const m = text.match(/^([^:]{2,90}):\s+(.+)$/);
  if (!m) return { label: "", detail: text };
  // "Preferred: AppSec PM title: ..." names the requirement after the tag.
  const tag = m[1].trim().match(/^(preferred|required|nice to have|must have|bonus)$/i);
  if (tag) {
    const inner = m[2].match(/^([^:]{2,90}):\s+(.+)$/);
    if (inner) return { label: `${inner[1].trim()} (${tag[1].toLowerCase()})`, detail: inner[2].trim() };
  }
  return { label: m[1].trim(), detail: m[2].trim() };
}

const isNone = (i: FitItem) => /^none\b/i.test(i.label || i.detail);

function sections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = body.split(/^##\s+/m);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    if (nl < 0) continue;
    out.set(p.slice(0, nl).trim().toLowerCase(), p.slice(nl + 1).trim());
  }
  return out;
}

function bullets(text: string): FitItem[] {
  return text
    .split("\n")
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map(splitItem)
    .filter((i) => i.detail || i.label);
}

/** The bullets under a bold sub-heading such as **Met**, up to the next one. */
function group(text: string, name: string): FitItem[] {
  const re = new RegExp(`\\*\\*${name}\\*\\*:?\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[A-Z][^*]*\\*\\*|$)`, "i");
  const m = text.match(re);
  return m ? bullets(m[1]).filter((i) => !isNone(i)) : [];
}

/** An inline bold label such as "**Matched:** a, b, c". */
function inline(text: string, name: string): string {
  const m = text.match(new RegExp(`\\*\\*${name}:?\\*\\*:?\\s*([^\\n]+)`, "i"));
  return m ? clean(m[1]) : "";
}

export function parseMatchBody(body: string | null | undefined): MatchSections | null {
  if (!body || !body.includes("##")) return null;
  const s = sections(body);
  const req = s.get("requirements") ?? "";
  const skills = s.get("skills") ?? "";
  const deal = clean(s.get("deal breakers") ?? "");
  return {
    summary: clean(s.get("summary") ?? ""),
    met: group(req, "Met"),
    partial: group(req, "Partial"),
    missing: group(req, "Missing"),
    skills: {
      matched: inline(skills, "Matched"),
      transferable: inline(skills, "Transferable"),
      missing: inline(skills, "Missing"),
      bonus: inline(skills, "Bonus"),
    },
    experience: clean(s.get("experience") ?? ""),
    dealBreakers: /^none\b/i.test(deal) ? "" : deal,
    tips: bullets(s.get("tailoring tips") ?? ""),
  };
}

/** The posting's own requirement bullets (under a "Requirements"-like heading), as plain text. */
export function postingRequirements(html: string | null | undefined, max = 12): string[] {
  if (!html) return [];
  const text = html
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = /(requirement|qualification|what you('|’)ll bring|what you bring|you have|you('|’)ll need|we('|’)re looking for|must have|about you|skills)/i;
  const out: string[] = [];
  let on = false;
  for (const l of lines) {
    const bullet = l.startsWith("•");
    if (!bullet && l.length < 80 && head.test(l)) {
      on = true;
      continue;
    }
    if (on && bullet) out.push(l.replace(/^•\s*/, ""));
    else if (on && !bullet && out.length) on = false;
  }
  return out.slice(0, max);
}
