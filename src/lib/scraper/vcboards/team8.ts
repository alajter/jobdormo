import { decodeHtml, flattenHtml } from "../html";

export interface Team8Row {
  title: string;
  company: string;
  location: string;
  url: string;
}

// The careers page renders every role as a row: position-title, project
// (the company; "Team8" means a stealth Team8 startup), place-title, and an
// arrow link to the role page.
export function parseTeam8Listing(html: string): Team8Row[] {
  const rows: Team8Row[] = [];
  const re =
    /class="position-title">([\s\S]*?)<\/div>[\s\S]*?class="project[^"]*">([\s\S]*?)<\/div>[\s\S]*?class="column place">([\s\S]*?)<div class="column arrow">[\s\S]*?href="(https:\/\/team8\.vc\/career\/[^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const title = flattenHtml(m[1]);
    const project = flattenHtml(m[2]);
    const location = flattenHtml(m[3]);
    if (!title) continue;
    rows.push({
      title,
      company: project.toLowerCase() === "team8" ? "Team8 (stealth startup)" : project,
      location,
      url: m[4],
    });
  }
  return rows;
}

// A role page's text from "Description" up to the apply form, as simple HTML
// paragraphs. Returns "" when the section isn't found.
export function parseTeam8Detail(html: string): string {
  const body = html
    .replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n");
  const text = decodeHtml(body.replace(/<[^>]+>/g, " "));
  const start = text.search(/\bDescription\b/);
  if (start < 0) return "";
  let section = text.slice(start + "Description".length);
  const end = section.search(/\b(Apply for this|Apply now|Submit application)\b/i);
  if (end > 0) section = section.slice(0, end);
  const lines = section
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
