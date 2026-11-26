import "server-only";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { execFile } from "child_process";
import path from "path";
import type { CvTrack } from "@/models/cvTrack.model";

// CV tracks live next to the CVs themselves: <CV_DIR>/tracks.json lists
// { id, label, file } and each file is an HTML CV in the same folder. The
// folder (default personal/cv, gitignored) is the source of truth; the app
// only reads it.
const ID = /^[a-z0-9-]{1,40}$/;
// A file in the CV folder or one subfolder (e.g. "generic/My_CV.html").
const FILE = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]{0,59}\/)?[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}\.html$/;

/** CV HTML files in the CV folder and its subfolders (one level; not dot-folders or archive/), as relative paths. */
function cvHtmlFiles(): string[] {
  const root = cvDir();
  const out: string[] = [];
  let entries: import("fs").Dirent[] = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".html")) out.push(e.name);
    else if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "archive") {
      try {
        for (const f of readdirSync(path.join(root, e.name))) if (f.endsWith(".html")) out.push(`${e.name}/${f}`);
      } catch {
        // unreadable folder: skip
      }
    }
  }
  return out.filter((f) => !/cover[_-]?letter/i.test(f));
}

function cvDir(): string {
  return path.resolve(process.cwd(), process.env.CV_DIR || "personal/cv");
}

export function loadCvTracks(): CvTrack[] {
  try {
    const raw = JSON.parse(readFileSync(path.join(cvDir(), "tracks.json"), "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t) => t && ID.test(t.id) && typeof t.label === "string" && FILE.test(t.file))
      .map((t) => ({ id: t.id, label: t.label.slice(0, 80), file: t.file }));
  } catch {
    return [];
  }
}

/** The track's CV as plain text (for matching), or null if unreadable. */
export function readTrackCvText(trackId: string): string | null {
  const track = loadCvTracks().find((t) => t.id === trackId);
  if (!track) return null;
  try {
    const html = readFileSync(path.join(cvDir(), track.file), "utf8");
    return htmlCvToText(html);
  } catch {
    return null;
  }
}

export function htmlCvToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// ---- Editing (used by "Improve my CV") ----


export function trackCvPath(trackId: string): string | null {
  const track = loadCvTracks().find((t) => t.id === trackId);
  return track ? path.join(cvDir(), track.file) : null;
}

export function readTrackCvHtml(trackId: string): string | null {
  const p = trackCvPath(trackId);
  try {
    return p ? readFileSync(p, "utf8") : null;
  } catch {
    return null;
  }
}

/** Last time the track's CV file changed (ms), or 0 if unknown. */
export function trackCvMtime(trackId: string): number {
  const p = trackCvPath(trackId);
  try {
    return p ? statSync(p).mtimeMs : 0;
  } catch {
    return 0;
  }
}

/** Saves a timestamped backup to <CV_DIR>/.history, then writes the new HTML. */
export function writeTrackCvHtml(trackId: string, html: string): string {
  const p = trackCvPath(trackId);
  if (!p) throw new Error("Unknown track");
  const history = path.join(cvDir(), ".history");
  if (!existsSync(history)) mkdirSync(history, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(history, `${path.basename(p, ".html")}.${stamp}.html`);
  copyFileSync(p, backup);
  writeFileSync(p, html, "utf8");
  return backup;
}

/** Puts back HTML read before an edit (no new backup: the edit made one). */
export function restoreTrackCvHtml(trackId: string, html: string) {
  const p = trackCvPath(trackId);
  if (!p) throw new Error("Unknown track");
  writeFileSync(p, html, "utf8");
}

/** CVs may run to two pages (readable spacing beats cramming one page). */
export const CV_MAX_PAGES = 2;

/** Renders the track's CV to PDF next to it; resolves with the page count. */
export function renderTrackCvPdf(trackId: string): Promise<{ pdf: string; pages: number | null }> {
  const p = trackCvPath(trackId);
  if (!p) return Promise.reject(new Error("Unknown track"));
  return renderHtmlToPdf(p);
}

/** Renders an HTML file to a PDF next to it (headless Chrome); resolves with the page count. */
// Chrome or Chromium for headless PDF rendering: CHROME_PATH, else the
// usual install locations on macOS, Linux and Windows.
export function findChrome(): string | null {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"]
      : process.platform === "win32"
        ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  return candidates.find((c) => existsSync(c)) ?? null;
}

export function renderHtmlToPdf(htmlPath: string): Promise<{ pdf: string; pages: number | null }> {
  const pdf = htmlPath.replace(/\.html$/, ".pdf");
  const chrome = findChrome();
  if (!chrome) return Promise.reject(new Error("Chrome or Chromium not found: install it or set CHROME_PATH to render PDFs."));
  return new Promise((resolve, reject) => {
    execFile(
      chrome,
      ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, htmlPath],
      { timeout: 60_000 },
      (err) => {
        if (err) return reject(err);
        try {
          const m = readFileSync(pdf, "latin1").match(/\/Count (\d+)/);
          resolve({ pdf, pages: m ? Number(m[1]) : null });
        } catch {
          resolve({ pdf, pages: null });
        }
      },
    );
  });
}

/** A path inside the CV folder, or null if `rel` would escape it. */
export function cvPath(rel: string): string | null {
  const root = cvDir();
  const p = path.resolve(root, rel);
  return p.startsWith(root + path.sep) ? p : null;
}

/** Writes a file inside the CV folder, backing up any previous version to .history. */
export function writeCvFile(rel: string, html: string): string {
  const p = cvPath(rel);
  if (!p) throw new Error("Bad CV path");
  mkdirSync(path.dirname(p), { recursive: true });
  if (existsSync(p)) {
    const history = path.join(cvDir(), ".history");
    mkdirSync(history, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(p, path.join(history, `${path.basename(p, ".html")}.${stamp}.html`));
  }
  writeFileSync(p, html, "utf8");
  return p;
}

/**
 * Everything the user has written about their career, as plain text: every CV
 * in the CV folder (track CVs and hand-made versions, not cover letters and
 * not the AI-tailored ones passed in `exclude`) and their LinkedIn profile text
 * (LINKEDIN_PROFILE_FILE, default ../linkedin-rewrite.md). Repeated lines are
 * kept once. A source of true facts for tailoring.
 */
export function readCareerKnowledge(exclude: string[] = [], maxChars = 30000): string {
  const root = cvDir();
  const skip = new Set(exclude.map((e) => path.resolve(root, e)));
  const seen = new Set<string>();
  const parts: string[] = [];
  const addText = (label: string, text: string) => {
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 3 && !seen.has(l.toLowerCase()));
    lines.forEach((l) => seen.add(l.toLowerCase()));
    if (lines.length) parts.push(`## ${label}\n${lines.join("\n")}`);
  };
  for (const f of cvHtmlFiles()) {
    const p = path.join(root, f);
    if (skip.has(p)) continue;
    try {
      const html = readFileSync(p, "utf8")
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\/(li|p|h\d|tr|div)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&");
      addText(`CV version: ${path.basename(f, ".html")}`, html);
    } catch {
      // unreadable file: skip
    }
  }
  const li = process.env.LINKEDIN_PROFILE_FILE || path.join(root, "..", "linkedin-rewrite.md");
  try {
    addText("LinkedIn profile", readFileSync(path.resolve(process.cwd(), li), "utf8"));
  } catch {
    // no LinkedIn file
  }
  return parts.join("\n\n").slice(0, maxChars);
}

/** The files readCareerKnowledge reads, for showing the user (names only). */
export function listCareerSources(exclude: string[] = []): { cvs: string[]; linkedin: string | null } {
  const root = cvDir();
  const skip = new Set(exclude.map((e) => path.resolve(root, e)));
  const cvs = cvHtmlFiles()
    .filter((f) => !skip.has(path.join(root, f)))
    .map((f) => f.replace(/\.html$/, ""));
  const li = process.env.LINKEDIN_PROFILE_FILE || path.join(root, "..", "linkedin-rewrite.md");
  return { cvs, linkedin: existsSync(path.resolve(process.cwd(), li)) ? path.basename(li) : null };
}

/** Optional facts file next to the CV folder (e.g. personal/about-me.txt). */
export function readAboutMe(): string {
  const p = process.env.ABOUT_ME_FILE || path.join(cvDir(), "..", "about-me.txt");
  try {
    return readFileSync(path.resolve(process.cwd(), p), "utf8");
  } catch {
    return "";
  }
}

/** Optional file of outreach messages the user actually sent (style examples). */
export function readOutreachExamples(): string {
  const p = process.env.OUTREACH_EXAMPLES_FILE || path.join(cvDir(), "..", "outreach-examples.md");
  try {
    return readFileSync(path.resolve(process.cwd(), p), "utf8");
  } catch {
    return "";
  }
}
