"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "./shared";
import { createTrackFromText, setupStatus, type SetupStep } from "@/lib/setup/setup.server";

export const getSetupStatus = async (): Promise<SetupStep[]> => {
  try {
    const user = await requireUser();
    return await setupStatus(user.id);
  } catch {
    return [];
  }
};

/** Builds a CV for one kind of role from pasted CV text. */
export const addCvFromText = async (input: {
  label: string;
  text: string;
}): Promise<{ success: boolean; label?: string; pages?: number | null; message?: string }> => {
  try {
    const user = await requireUser();
    const track = await createTrackFromText(user.id, { label: String(input.label ?? ""), text: String(input.text ?? "") });
    revalidatePath("/dashboard");
    return { success: true, label: track.label, pages: track.pages };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't create the CV." };
  }
};
