"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { requireUser } from "./shared";
import {
  UserSettingsData,
  defaultUserSettings,
  AiSettings,
  DisplaySettings,
  CANDIDATE_NOTES_MAX_CHARS,
} from "@/models/userSettings.model";

export const getUserSettings = async (): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    if (!userSettings) {
      return {
        success: true,
        data: {
          userId: user.id,
          settings: defaultUserSettings,
        },
      };
    }

    const settings: UserSettingsData = JSON.parse(userSettings.settings);

    return {
      success: true,
      data: {
        userId: user.id,
        settings: {
          ...defaultUserSettings,
          ...settings,
        },
      },
    };
  } catch (error) {
    const msg = "Failed to fetch user settings.";
    return handleError(error, msg);
  }
};

export const updateUserSettings = async (
  settings: Partial<UserSettingsData>
): Promise<any | undefined> => {
  try {
    const user = await requireUser();

    const existingSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    let mergedSettings: UserSettingsData;

    if (existingSettings) {
      const currentSettings: UserSettingsData = JSON.parse(
        existingSettings.settings
      );
      mergedSettings = {
        ...defaultUserSettings,
        ...currentSettings,
        ...settings,
        ai: {
          ...defaultUserSettings.ai,
          ...currentSettings.ai,
          ...settings.ai,
        },
        display: {
          ...defaultUserSettings.display,
          ...currentSettings.display,
          ...settings.display,
        },
      };
    } else {
      mergedSettings = {
        ...defaultUserSettings,
        ...settings,
        ai: { ...defaultUserSettings.ai, ...settings.ai },
        display: { ...defaultUserSettings.display, ...settings.display },
      };
    }

    const userSettings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        settings: JSON.stringify(mergedSettings),
      },
      create: {
        userId: user.id,
        settings: JSON.stringify(mergedSettings),
      },
    });

    const parsedSettings: UserSettingsData = JSON.parse(userSettings.settings);

    return {
      success: true,
      data: {
        userId: user.id,
        settings: parsedSettings,
      },
    };
  } catch (error) {
    const msg = "Failed to update user settings.";
    return handleError(error, msg);
  }
};

export const updateAiSettings = async (
  aiSettings: AiSettings
): Promise<any | undefined> => {
  return updateUserSettings({ ai: aiSettings });
};

export const updateCandidateNotes = async (
  notes: string
): Promise<any | undefined> => {
  if (typeof notes !== "string" || notes.length > CANDIDATE_NOTES_MAX_CHARS) {
    return {
      success: false,
      message: `Notes must be ${CANDIDATE_NOTES_MAX_CHARS} characters or fewer.`,
    };
  }
  // Keep the facts gathered by Improve my CV: they live beside the notes.
  let facts: string | undefined;
  try {
    const user = await requireUser();
    const row = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    facts = row ? JSON.parse(row.settings)?.candidate?.facts : undefined;
  } catch {
    facts = undefined;
  }
  return updateUserSettings({ candidate: { notes, ...(facts ? { facts } : {}) } });
};

export const updateDisplaySettings = async (
  displaySettings: DisplaySettings
): Promise<any | undefined> => {
  return updateUserSettings({ display: displaySettings });
};
