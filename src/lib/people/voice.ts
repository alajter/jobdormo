import "server-only";
import prisma from "@/lib/db";
import { getModel } from "@/lib/ai";
import { getUserAiSettings, getDefaultModelForProvider } from "@/lib/scraper/automation-run/aiSettings";
import { loadCvTracks, readAboutMe, readOutreachExamples, readTrackCvText } from "@/lib/cv/tracks";
import { defaultUserSettings, type UserSettingsData } from "@/models/userSettings.model";

// What the AI needs to write as the user: their notes and rules, their main CV,
// and messages / posts they actually wrote (for voice, never for facts).
export async function candidateContext(userId: string): Promise<{ notes: string; cv: string; examples: string }> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
  const notes = [settings.candidate?.notes ?? "", settings.candidate?.facts ?? "", readAboutMe()]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12000);
  const main = loadCvTracks()[0];
  const cv = (main && readTrackCvText(main.id)) || "";
  return { notes, cv, examples: readOutreachExamples().slice(0, 8000) };
}

export async function userModel(userId: string) {
  const ai = await getUserAiSettings(userId);
  return getModel(ai.provider, ai.model || getDefaultModelForProvider(ai.provider), userId);
}

export const VOICE = `Write as the candidate, in their own voice: warm, plain, short sentences, simple words, the way their example messages read. Not polished copywriting.
Rules:
- Use only facts from their CV, their notes and what they say about the recipient. Never invent shared history, how they know each other, or that they read or liked their posts.
- Follow every rule in their notes (for example which companies never to name).
- No buzzwords, no em dashes, no emoji unless their examples use them.
- Output ONLY the text. No quotes, no commentary.`;
