"use server";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { listCareerSources } from "@/lib/cv/tracks";
import {
  CANDIDATE_FACTS_MAX_CHARS,
  defaultUserSettings,
  type UserSettingsData,
} from "@/models/userSettings.model";

// Career knowledge: the facts the AI collected from the user's answers
// (Improve my CV, Tailor CV), editable here, and the files it reads.

export const getCareerKnowledge = async (): Promise<{
  facts: string;
  sources: { cvs: string[]; linkedin: string | null; tailored: string[] };
}> => {
  const user = await requireUser();
  const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
  const tailored = (
    await prisma.job.findMany({ where: { userId: user.id, tailoredCv: { not: null } }, select: { tailoredCv: true } })
  )
    .map((j) => j.tailoredCv!)
    .filter(Boolean);
  const { cvs, linkedin } = listCareerSources(tailored);
  return {
    facts: settings.candidate?.facts ?? "",
    sources: { cvs, linkedin, tailored: tailored.map((t) => t.replace(/\.html$/, "")) },
  };
};

/** Replaces the saved facts with the user's edited version. Notes are kept. */
export const updateCandidateFacts = async (facts: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const user = await requireUser();
    if (typeof facts !== "string" || facts.length > CANDIDATE_FACTS_MAX_CHARS) {
      return { success: false, message: `Facts must be ${CANDIDATE_FACTS_MAX_CHARS} characters or fewer.` };
    }
    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    const settings: UserSettingsData = row ? JSON.parse(row.settings) : defaultUserSettings;
    const merged = { ...settings, candidate: { notes: settings.candidate?.notes ?? "", facts } };
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: { settings: JSON.stringify(merged) },
      create: { userId: user.id, settings: JSON.stringify(merged) },
    });
    return { success: true };
  } catch {
    return { success: false, message: "Couldn't save the facts." };
  }
};
