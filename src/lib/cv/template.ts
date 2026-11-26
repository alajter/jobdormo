// The built-in CV template: structured CV data → a two-page A4 HTML CV in the
// structure the rest of the app reads (tailoring edits <li> bullets and the
// SUMMARY paragraph, roles are div.role with rtitle / co / dates, skills are
// table rows). Pure; every value is escaped.

export type StructuredCv = {
  name: string;
  headline: string;
  contact: string[];
  summary: string;
  experience: { title: string; company: string; location?: string; dates: string; bullets: string[] }[];
  projects: { name: string; url?: string; description: string }[];
  education: { degree: string; school: string; dates?: string }[];
  skills: { label: string; items: string }[];
};

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : "");

const STYLE = `
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 10pt; line-height: 1.42; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 2px; letter-spacing: -0.2px; }
  .headline { color: #1f4f46; font-weight: 600; font-size: 11.5pt; margin: 0 0 3px; }
  .contact { color: #555; font-size: 9.2pt; margin-bottom: 10px; }
  h2 { color: #1f4f46; font-size: 11pt; letter-spacing: 0.6px; margin: 13px 0 6px; padding-bottom: 3px; border-bottom: 1.4px solid #1f4f46; break-after: avoid; }
  p { margin: 0; }
  .role { margin-top: 9px; break-inside: avoid; }
  .rhead { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .rtitle { font-weight: 700; }
  .co { color: #1f4f46; font-weight: 600; }
  .dates { color: #555; font-size: 9.2pt; white-space: nowrap; }
  a { color: #1f4f46; text-decoration: none; }
  ul { margin: 3px 0 0; padding-left: 16px; }
  li { margin: 2.5px 0; }
  table { border-collapse: collapse; width: 100%; }
  td { vertical-align: top; padding: 2.5px 0; }
  td.k { font-weight: 700; width: 110px; }
`;

export function renderCvHtml(cv: StructuredCv): string {
  const roles = cv.experience
    .map(
      (r) => `<div class="role">
  <div class="rhead"><span><span class="rtitle">${esc(r.title)}</span> · <span class="co">${esc(r.company)}</span>${r.location ? ` · ${esc(r.location)}` : ""}</span><span class="dates">${esc(r.dates)}</span></div>
  <ul>
${r.bullets.map((b) => `    <li>${esc(b)}</li>`).join("\n")}
  </ul>
</div>`,
    )
    .join("\n\n");
  const projects = cv.projects.length
    ? `\n<h2>PROJECTS</h2>\n<ul>\n${cv.projects
        .map((p) => {
          const url = safeUrl(p.url);
          return `  <li><b>${url ? `<a href="${esc(url)}">${esc(p.name)}</a>` : esc(p.name)}</b>: ${esc(p.description)}</li>`;
        })
        .join("\n")}\n</ul>\n`
    : "";
  const education = cv.education.length
    ? `\n<h2>EDUCATION</h2>\n${cv.education
        .map((e) => `<div class="rhead"><span><span class="rtitle">${esc(e.degree)}</span> · <span class="co">${esc(e.school)}</span></span><span class="dates">${esc(e.dates ?? "")}</span></div>`)
        .join("\n")}\n`
    : "";
  const skills = cv.skills.length
    ? `\n<h2>SKILLS</h2>\n<table>\n${cv.skills.map((s) => `  <tr><td class="k">${esc(s.label)}</td><td>${esc(s.items)}</td></tr>`).join("\n")}\n</table>\n`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(cv.name)}</title>
<style>${STYLE}</style>
</head>
<body>

<h1>${esc(cv.name)}</h1>
<p class="headline">${esc(cv.headline)}</p>
<p class="contact">${cv.contact.map(esc).join(" · ")}</p>

<h2>SUMMARY</h2>
<p>${esc(cv.summary)}</p>

<h2>EXPERIENCE</h2>

${roles}
${projects}${education}${skills}
</body>
</html>
`;
}

/** Fills gaps and trims a model's JSON into a StructuredCv. */
export function normalizeStructuredCv(raw: unknown): StructuredCv | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const cv: StructuredCv = {
    name: s(o.name, 120),
    headline: s(o.headline, 200),
    contact: arr(o.contact).map((c) => s(c, 120)).filter(Boolean).slice(0, 6),
    summary: s(o.summary, 1500),
    experience: arr(o.experience)
      .map((r) => {
        const x = (r ?? {}) as Record<string, unknown>;
        return {
          title: s(x.title, 160),
          company: s(x.company, 160),
          location: s(x.location, 80) || undefined,
          dates: s(x.dates, 60),
          bullets: arr(x.bullets).map((b) => s(b, 600)).filter(Boolean).slice(0, 10),
        };
      })
      .filter((r) => r.title || r.company)
      .slice(0, 15),
    projects: arr(o.projects)
      .map((p) => {
        const x = (p ?? {}) as Record<string, unknown>;
        return { name: s(x.name, 120), url: s(x.url, 300) || undefined, description: s(x.description, 500) };
      })
      .filter((p) => p.name)
      .slice(0, 6),
    education: arr(o.education)
      .map((e) => {
        const x = (e ?? {}) as Record<string, unknown>;
        return { degree: s(x.degree, 160), school: s(x.school, 160), dates: s(x.dates, 60) || undefined };
      })
      .filter((e) => e.degree || e.school)
      .slice(0, 5),
    skills: arr(o.skills)
      .map((k) => {
        const x = (k ?? {}) as Record<string, unknown>;
        return { label: s(x.label, 40), items: s(x.items, 400) };
      })
      .filter((k) => k.label && k.items)
      .slice(0, 8),
  };
  return cv.name && cv.experience.length ? cv : null;
}
