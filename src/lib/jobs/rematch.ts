import "server-only";
import { spawn } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

// Background re-match of the user's open jobs (scripts/match-jobs.ts), then
// a gaps rebuild (scripts/summarize-gaps.ts). One run at a time per machine:
// a lock file holds the shell's pid while it runs.
const LOCK = path.join(os.tmpdir(), "jobsync-rematch.lock");

function running(): boolean {
  try {
    if (!existsSync(LOCK)) return false;
    const pid = Number(readFileSync(LOCK, "utf8"));
    process.kill(pid, 0); // throws if the process is gone
    return true;
  } catch {
    try {
      unlinkSync(LOCK);
    } catch {
      // already gone
    }
    return false;
  }
}

/**
 * Starts the re-match. With `all`, every open job is re-matched; otherwise
 * only jobs whose match is missing or stale. Returns false if one is running.
 */
export function startBackgroundRematch(email: string, all = false): boolean {
  if (running()) return false;
  const tsx = "npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env";
  const cmd = `trap 'rm -f "$LOCK"' EXIT; ${all ? "ALL=1 " : ""}${tsx} scripts/match-jobs.ts "$E" && ${tsx} scripts/summarize-gaps.ts "$E"`;
  const child = spawn("/bin/sh", ["-c", cmd], {
    cwd: process.cwd(),
    env: { ...process.env, E: email, LOCK },
    detached: true,
    stdio: "ignore",
  });
  if (child.pid) writeFileSync(LOCK, String(child.pid));
  child.unref();
  return true;
}

export function isRematchRunning(): boolean {
  return running();
}
