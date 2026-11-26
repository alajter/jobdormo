import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { userModel } from "@/lib/people/voice";
import { cvPath, loadCvTracks, renderHtmlToPdf } from "@/lib/cv/tracks";
import { normalizeStructuredCv, renderCvHtml } from "@/lib/cv/template";
import { getSearchRulesFor } from "@/lib/search/rules.server";

// First-run setup: what's done, and turning a pasted CV into a CV the app
// can tailor (one per kind of role).

export type SetupStep = { id: "ai" | "cv" | "notes" | "rules" | "connections"; done: boolean; required: boolean };

export async function setupStatus(userId: string): Promise<SetupStep[]> {
  const [settingsRow, keys, connections, rules] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId }, select: { settings: true } }),
    prisma.apiKey.findMany({ where: { userId }, select: { provider: true } }),
    prisma.contact.count({ where: { createdBy: userId, source: "linkedin" } }),
    getSearchRulesFor(userId),
  ]);
  let settings: { ai?: { provider?: string }; candidate?: { notes?: string } } = {};
  try {
    settings = settingsRow ? JSON.parse(settingsRow.settings) : {};
  } catch {
    settings = {};
  }
  const provider = settings.ai?.provider ?? "anthropic";
  const envKey: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
  const aiReady = provider === "ollama" || keys.some((k) => k.provider === provider) || !!envKey[provider];
  return [
    { id: "ai", done: aiReady, required: true },
    { id: "cv", done: loadCvTracks().length > 0, required: true },
    { id: "notes", done: !!settings.candidate?.notes?.trim(), required: true },
    { id: "rules", done: !!(rules.homeCity || rules.maxCompanySize || rules.seniorOnlyRoles.length), required: false },
    { id: "connections", done: connections > 0, required: false },
  ];
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cv";

/**
 * Builds a CV for one kind of role from pasted CV text: the model extracts the
 * structure (only what the text says), the built-in template renders it, and
 * it's added to the CV folder's tracks.json. Returns the new track.
 */
export async function createTrackFromText(
  userId: string,
  input: { label: string; text: string },
): Promise<{ id: string; label: string; file: string; pages: number | null }> {
  const label = input.label.trim().slice(0, 80);
  const text = input.text.trim().slice(0, 30000);
  if (!label || text.length < 200) throw new Error("Give the CV a name and paste the whole CV text.");

  const { text: raw } = await generateText({
    model: await userModel(userId),
    system: `Turn a pasted CV into structured data. Use ONLY what the text says: never add, improve, reword or invent anything (no new numbers, titles, skills or results). Keep the person's wording for bullets. Keep every role, newest first.
Return ONLY JSON: {"name":"","headline":"one line: current role or target and focus, from the CV","contact":["city","email","linkedin or website"],"summary":"the CV's summary or profile paragraph; if there is none, one or two sentences built only from facts in the CV","experience":[{"title":"","company":"","location":"","dates":"e.g. Jan 2021 – Present","bullets":[""]}],"projects":[{"name":"","url":"","description":""}],"education":[{"degree":"","school":"","dates":""}],"skills":[{"label":"e.g. Product","items":"comma-separated, from the CV"}]}
Use single quotes inside strings.`,
    prompt: `The CV is for this kind of role: ${label}\n\nCV text:\n${text}`,
    temperature: 0,
  });
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  let parsed: unknown = null;
  try {
    parsed = s >= 0 && e > s ? JSON.parse(raw.slice(s, e + 1)) : null;
  } catch {
    parsed = null;
  }
  const cv = normalizeStructuredCv(parsed);
  if (!cv) throw new Error("Couldn't read that CV. Paste the full text, with at least one role.");

  const tracksPath = cvPath("tracks.json");
  if (!tracksPath) throw new Error("Bad CV folder.");
  mkdirSync(path.dirname(tracksPath), { recursive: true });
  mkdirSync(path.join(path.dirname(tracksPath), "generic"), { recursive: true });
  mkdirSync(path.join(path.dirname(tracksPath), "jobs"), { recursive: true });

  const tracks = loadCvTracks();
  let id = slug(label);
  for (let i = 2; tracks.some((t) => t.id === id); i++) id = `${slug(label)}-${i}`;
  const file = `generic/${id}.html`;
  const htmlPath = cvPath(file)!;
  writeFileSync(htmlPath, renderCvHtml(cv), "utf8");

  let current: unknown[] = [];
  try {
    current = existsSync(tracksPath) ? JSON.parse(readFileSync(tracksPath, "utf8")) : [];
  } catch {
    current = [];
  }
  writeFileSync(tracksPath, JSON.stringify([...(Array.isArray(current) ? current : []), { id, label, file }], null, 2), "utf8");

  let pages: number | null = null;
  try {
    pages = (await renderHtmlToPdf(htmlPath)).pages;
  } catch {
    pages = null; // No Chrome: the HTML CV still works for matching and tailoring.
  }
  return { id, label, file, pages };
}
