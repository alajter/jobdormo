// Reads the "Missing" (and optionally "Partial") requirement labels out of a
// full match write-up (matchData.body, as written by the chat match or the
// daily match script). Pure and client-safe.
//
// The body's Requirements section looks like:
//   **Missing**
//   - **Prompt and context design (required):** Not stated...
export type MatchGaps = { missing: string[]; partial: string[] };

const EMPTY: MatchGaps = { missing: [], partial: [] };

function labelsUnder(body: string, heading: "Missing" | "Partial"): string[] {
  const start = body.search(new RegExp(`^\\*\\*${heading}\\*\\*\\s*$`, "m"));
  if (start < 0) return [];
  const rest = body.slice(start).split("\n").slice(1);
  const labels: string[] = [];
  for (const line of rest) {
    if (/^\*\*[^*]+\*\*\s*$/.test(line.trim()) || /^#/.test(line)) break; // next block
    // "- **Label:** text" or "- Label (qualifier): text"
    const bold = line.match(/^\s*-\s*\*\*(.+?):?\*\*/);
    const plain = bold ? null : line.match(/^\s*-\s*([^:]{3,120}):/);
    let raw = bold?.[1] ?? plain?.[1];
    // "- Preferred: <the actual gap>. Address by..." puts the gap after the colon.
    if (raw && /^(preferred|required|nice to have)$/i.test(raw.trim())) {
      raw = line.slice(line.indexOf(":") + 1).split(/\.\s|\(e\.g\./)[0];
    }
    if (raw) labels.push(raw.replace(/:$/, "").replace(/\s*\([^)]*\)\s*$/, "").trim());
  }
  return labels;
}

export function parseMatchGaps(matchData: string | null | undefined): MatchGaps {
  if (!matchData) return EMPTY;
  try {
    const body = JSON.parse(matchData)?.body;
    if (typeof body !== "string") return EMPTY;
    return { missing: labelsUnder(body, "Missing"), partial: labelsUnder(body, "Partial") };
  } catch {
    return EMPTY;
  }
}
