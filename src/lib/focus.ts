// "Where to focus": one verb per open job, with the reason in plain words.
// Pure and client-safe; the rules come from the user's Search rules (company
// size, roles taken only at a senior level, the ATS target, staleness), plus
// people before postings.
import { DEFAULT_SEARCH_RULES, isBelowSeniority, isTooBig, type SearchRules } from "@/models/searchRules.model";

export type FocusVerb = "apply" | "tailor" | "talk" | "look" | "skip";

export const FOCUS_VERBS: Record<FocusVerb, { label: string; order: number }> = {
  apply: { label: "Apply", order: 0 },
  tailor: { label: "Tailor", order: 1 },
  talk: { label: "Follow up", order: 2 },
  look: { label: "Look", order: 3 },
  skip: { label: "Skip", order: 4 },
};

export type FocusJob = {
  id: string;
  title: string;
  company: string;
  size?: string | null;
  stage?: string | null;
  match: number | null;
  atsBase: number | null;
  atsTailored: number | null;
  hasTailored: boolean;
  highIssues: number;
  outreachStatus?: string | null;
  postedAt?: Date | string | null;
  // Added by hand (not by the daily scan): the owner already chose it, so
  // weak fit or an old date never turns it into a skip.
  addedByYou?: boolean;
  now?: Date;
};

export type FocusPick = { id: string; verb: FocusVerb; reason: string };

function daysAgo(d: Date | string | null | undefined, now: Date): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return isNaN(t) ? null : Math.floor((now.getTime() - t) / 86_400_000);
}

export function focusFor(j: FocusJob, rules: SearchRules = DEFAULT_SEARCH_RULES): FocusPick {
  const now = j.now ?? new Date();
  const pick = (verb: FocusVerb, reason: string): FocusPick => ({ id: j.id, verb, reason });

  // People first: a job that came through someone is driven by that thread.
  if (j.outreachStatus && ["sent", "replied", "referred"].includes(j.outreachStatus)) {
    const what = j.outreachStatus === "sent" ? "You reached out; wait or nudge" : "In conversation; keep it moving";
    return pick("talk", what);
  }
  if (isTooBig(j.size, rules)) return pick("skip", `Bigger than you want (${j.size} people)`);
  if (isBelowSeniority(j.title, rules)) return pick("skip", "Below the level you take this kind of role at");
  const age = daysAgo(j.postedAt, now);
  if (!j.addedByYou) {
    if (age != null && age > rules.staleDays) return pick("skip", `Posted ${age} days ago`);
    if (j.match != null && j.match < rules.minMatch - 10) return pick("skip", `Weak fit (match ${j.match})`);
  }

  if (j.hasTailored && j.atsTailored != null && j.atsTailored >= rules.atsTarget) {
    if (j.highIssues > 0) return pick("tailor", `CV has ${j.highIssues} must-fix issue${j.highIssues === 1 ? "" : "s"}`);
    return pick("apply", "CV ready to send");
  }
  if (j.match == null) return pick("look", "Not scored yet");
  if (j.match >= rules.minMatch) {
    return pick("tailor", j.hasTailored ? `Good fit; CV below ${rules.atsTarget}%` : "Good fit; no CV for it yet");
  }
  return pick("look", j.addedByYou ? "You added it" : "Borderline fit");
}

/** Ranked: verb order, then match (highest first). */
export function rankFocus<T extends FocusJob>(jobs: T[], rules: SearchRules = DEFAULT_SEARCH_RULES): (FocusPick & { job: T })[] {
  return jobs
    .map((job) => ({ ...focusFor(job, rules), job }))
    .sort(
      (a, b) =>
        FOCUS_VERBS[a.verb].order - FOCUS_VERBS[b.verb].order || (b.job.match ?? -1) - (a.job.match ?? -1),
    );
}
