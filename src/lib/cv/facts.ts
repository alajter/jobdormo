import "server-only";
import prisma from "@/lib/db";
import { CANDIDATE_FACTS_MAX_CHARS, defaultUserSettings, type UserSettingsData } from "@/models/userSettings.model";

/**
 * Appends facts the user confirmed (in their words) to candidate.facts, so
 * later CVs, letters, matches and messages can use them. Only the oldest
 * facts are ever dropped; the user's own notes are never touched.
 */
export async function saveCandidateFacts(userId: string, heading: string, lines: string[]): Promise<void> {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  if (!clean.length) return;
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
  const add = `\n\n${heading} (${new Date().toISOString().slice(0, 10)}):\n${clean.map((l) => `- ${l.slice(0, 1000)}`).join("\n")}`;
  const facts = ((settings.candidate?.facts ?? "") + add).slice(-CANDIDATE_FACTS_MAX_CHARS);
  const merged = { ...settings, candidate: { notes: settings.candidate?.notes ?? "", facts } };
  await prisma.userSettings.upsert({
    where: { userId },
    update: { settings: JSON.stringify(merged) },
    create: { userId, settings: JSON.stringify(merged) },
  });
}
