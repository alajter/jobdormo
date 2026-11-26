import "server-only";
import { execFile, spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, readFileSync } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

// The daily job scan (scripts/daily-job-hunt.sh) as a macOS launchd agent.
// On = plist written to ~/Library/LaunchAgents and loaded; off = unloaded
// and removed, so it doesn't come back at the next login.
const run = promisify(execFile);
export const DAILY_SCAN_LABEL = "com.jobsync.daily-job-hunt";
const PLIST = path.join(os.homedir(), "Library", "LaunchAgents", `${DAILY_SCAN_LABEL}.plist`);
const SCRIPT = path.join(process.cwd(), "scripts", "daily-job-hunt.sh");
const LOG_DIR = path.join(process.cwd(), "personal", "web-finds");
const domain = () => `gui/${process.getuid?.() ?? 501}`;

export type DailyScanStatus = {
  supported: boolean; // macOS only
  enabled: boolean; // plist installed and loaded
  hour: number;
  minute: number;
  running: boolean;
  lastRun: string | null; // ISO time of the newest scan log
};

function plistXml(hour: number, minute: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by Jobdormo (Settings → Daily scan). Turn it off there. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>${DAILY_SCAN_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-lc</string><string>${SCRIPT}</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>/tmp/jobsync-daily-job-hunt.out</string>
  <key>StandardErrorPath</key><string>/tmp/jobsync-daily-job-hunt.err</string>
</dict>
</plist>
`;
}

function readTime(): { hour: number; minute: number } {
  try {
    const xml = readFileSync(PLIST, "utf8");
    const hour = Number(/<key>Hour<\/key><integer>(\d+)/.exec(xml)?.[1] ?? 8);
    const minute = Number(/<key>Minute<\/key><integer>(\d+)/.exec(xml)?.[1] ?? 0);
    return { hour, minute };
  } catch {
    return { hour: 8, minute: 0 };
  }
}

async function loaded(): Promise<boolean> {
  try {
    await run("launchctl", ["print", `${domain()}/${DAILY_SCAN_LABEL}`]);
    return true;
  } catch {
    return false;
  }
}

async function scanRunning(): Promise<boolean> {
  try {
    await run("pgrep", ["-f", "scripts/daily-job-hunt.sh"]);
    return true;
  } catch {
    return false;
  }
}

function lastRun(): string | null {
  try {
    const logs = readdirSync(LOG_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f));
    const newest = logs.map((f) => statSync(path.join(LOG_DIR, f)).mtime).sort((a, b) => +b - +a)[0];
    return newest ? newest.toISOString() : null;
  } catch {
    return null;
  }
}

export async function getDailyScanStatus(): Promise<DailyScanStatus> {
  const supported = process.platform === "darwin";
  return {
    supported,
    enabled: supported && existsSync(PLIST) && (await loaded()),
    ...readTime(),
    running: await scanRunning(),
    lastRun: lastRun(),
  };
}

// Unloading the launchd job kills a scan it started, so the schedule is
// never changed while a scan is running.
export class ScanRunningError extends Error {
  constructor() {
    super("A scan is running right now. Change the schedule after it finishes (usually within two hours).");
  }
}

/** Installs (or re-times) the schedule and turns it on. */
export async function enableDailyScan(hour: number, minute: number): Promise<void> {
  if (process.platform !== "darwin") throw new Error("macOS only");
  if (await scanRunning()) throw new ScanRunningError();
  await disableDailyScan();
  mkdirSync(path.dirname(PLIST), { recursive: true });
  writeFileSync(PLIST, plistXml(hour, minute));
  await run("launchctl", ["bootstrap", domain(), PLIST]);
}

/** Turns the schedule off and removes it. */
export async function disableDailyScan(): Promise<void> {
  if (await scanRunning()) throw new ScanRunningError();
  if (await loaded()) {
    try {
      await run("launchctl", ["bootout", `${domain()}/${DAILY_SCAN_LABEL}`]);
    } catch {
      // already unloaded
    }
  }
  if (existsSync(PLIST)) unlinkSync(PLIST);
}

/** Starts a scan now, in the background. False if one is already running. */
export async function runDailyScanNow(): Promise<boolean> {
  if (await scanRunning()) return false;
  const child = spawn("/bin/zsh", ["-lc", SCRIPT], { cwd: process.cwd(), detached: true, stdio: "ignore" });
  child.unref();
  return true;
}
