"use server";
import { requireUser } from "./shared";
import {
  disableDailyScan,
  enableDailyScan,
  getDailyScanStatus,
  runDailyScanNow,
  ScanRunningError,
  type DailyScanStatus,
} from "@/lib/schedule/dailyScan";

// Settings → Daily scan. The schedule lives on this machine (launchd), so
// these only make sense for a self-hosted, single-user install.
export const getDailyScan = async (): Promise<DailyScanStatus | null> => {
  try {
    await requireUser();
    return await getDailyScanStatus();
  } catch {
    return null;
  }
};

export const setDailyScan = async (
  on: boolean,
  hour = 8,
  minute = 0,
): Promise<{ success: boolean; message: string; status?: DailyScanStatus }> => {
  try {
    await requireUser();
    const h = Math.trunc(hour);
    const m = Math.trunc(minute);
    if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return { success: false, message: "Pick a valid time." };
    if (on) await enableDailyScan(h, m);
    else await disableDailyScan();
    return {
      success: true,
      message: on ? `Daily scan on, every day at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}.` : "Daily scan off.",
      status: await getDailyScanStatus(),
    };
  } catch (e) {
    if (e instanceof ScanRunningError) return { success: false, message: e.message };
    return { success: false, message: on ? "Couldn't turn the daily scan on." : "Couldn't turn the daily scan off." };
  }
};

export const runScanNow = async (): Promise<{ success: boolean; message: string }> => {
  try {
    await requireUser();
    return (await runDailyScanNow())
      ? { success: true, message: "Scan started. It takes 15 to 30 minutes; new jobs appear on your board as it goes." }
      : { success: false, message: "A scan is already running." };
  } catch {
    return { success: false, message: "Couldn't start the scan." };
  }
};
