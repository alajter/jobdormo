// Types and the hard rules for "does this position fit me?". Pure and
// client-safe, so the result can be rendered and the rules tested.

export type FitVerdict = "apply" | "long_shot" | "skip";

export type FitCheck = {
  company: string;
  title: string;
  location: string;
  workplace: string;
  size: string;
  about: string;
  track: string | null;
  trackLabel: string | null;
  ats: { score: number; missing: string[] } | null;
  known: { name: string; title: string | null }[];
  onBoard: { jobId: string; status: string; title: string } | null;
  verdict: FitVerdict;
  summary: string;
  whyApply: string[];
  whyNot: string[];
  requirements: { text: string; status: "met" | "partial" | "missing"; evidence: string }[];
};

export const FIT_VERDICTS: Record<FitVerdict, { label: string }> = {
  apply: { label: "Apply" },
  long_shot: { label: "Long shot" },
  skip: { label: "Skip" },
};

import { isBelowSeniority, isTooBig, locationCheck, type SearchRules } from "@/models/searchRules.model";

/** The user's hard rules (Settings → Search rules): office location, company size, role level. */
export function fitFlags(
  input: { location: string; workplace: string; size: string; title: string },
  rules: SearchRules,
): { reasons: string[]; hard: boolean } {
  const reasons: string[] = [];
  let hard = false;
  const loc = locationCheck(input.location, input.workplace, rules);
  if (loc) {
    reasons.push(loc.reason);
    hard = hard || loc.hard;
  }
  if (isTooBig(input.size, rules)) {
    reasons.push(`Bigger than you want (${input.size} people).`);
    hard = true;
  }
  if (isBelowSeniority(input.title, rules)) {
    reasons.push("Below the level you take this kind of role at.");
    hard = true;
  }
  return { reasons, hard };
}
