"use server";
import { requireUser } from "./shared";
import { isRematchRunning, startBackgroundRematch } from "@/lib/jobs/rematch";

// "Re-match all jobs": full AI match of every open job against its track's
// CV, then the gaps rebuild, in the background (10-20 minutes).
export const rematchAllJobs = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const user = await requireUser();
    if (!user.email) return { success: false, message: "No email on this account." };
    const started = startBackgroundRematch(user.email, true);
    return started
      ? { success: true, message: "Re-matching every open job in the background. It takes 10 to 20 minutes; reload then to see new scores and gaps." }
      : { success: false, message: "A re-match is already running. Reload in a few minutes." };
  } catch {
    return { success: false, message: "Couldn't start the re-match." };
  }
};

export const getRematchStatus = async (): Promise<{ running: boolean }> => {
  try {
    await requireUser();
    return { running: isRematchRunning() };
  } catch {
    return { running: false };
  }
};
