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

// Cities next to Tel Aviv: a commute to check, not a reason to skip.
const NEAR_TEL_AVIV = /\b(ramat[\s-]?gan|givatayim|bnei[\s-]?brak|herzliya|holon|bat[\s-]?yam|petah[\s-]?tikva|petach[\s-]?tikva)\b/i;

/** The owner's hard rules: office location, company size, CS level. */
export function fitFlags(input: {
  location: string;
  workplace: string;
  size: string;
  title: string;
  big: boolean;
  juniorCs: boolean;
}): { reasons: string[]; hard: boolean } {
  const reasons: string[] = [];
  let hard = false;
  const remote = /remote/i.test(input.workplace);
  const loc = input.location;
  if (loc && !remote) {
    if (/tel[\s-]?aviv\s+district|center district|central district/i.test(loc) && !/tel[\s-]?aviv[-\s]?(yafo|jaffa)?\s*,/i.test(loc))
      reasons.push(`"${loc}" can mean anywhere around Tel Aviv: check the office address.`);
    else if (NEAR_TEL_AVIV.test(loc)) reasons.push(`Office in ${loc.split(",")[0]}, next to Tel Aviv: check the commute.`);
    else if (!/tel[\s-]?aviv/i.test(loc)) {
      reasons.push(`Office in ${loc}, outside Tel Aviv.`);
      hard = true;
    }
  }
  if (input.big) {
    reasons.push(`Big company (${input.size} people).`);
    hard = true;
  }
  if (input.juniorCs) {
    reasons.push("Customer Success below VP/Head.");
    hard = true;
  }
  return { reasons, hard };
}
