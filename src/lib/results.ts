// "Results": what's working and what isn't, from the owner's own
// applications, messages and posts. Pure. Every claim carries its count, and
// nothing is called a pattern below MIN_GROUP data points.

export const MIN_GROUP = 5;
export const SILENT_DAYS = 14;
export const CV_TARGET = 75; // default; the user's Search rules can change it

export type Outcome = "offer" | "interview" | "rejected" | "withdrawn" | "waiting";

export type AppRow = {
  id: string;
  company: string;
  title: string;
  status: string;
  appliedAt: Date | null;
  outreach: string | null;
  source: string | null;
  hasTailored: boolean;
  tailoredAts: number | null;
  // The CV that went out ("tailored" | "generic") and its ATS match then.
  sentCv?: string | null;
  sentAts?: number | null;
  followUpOff?: boolean;
  // Status values of the job's timeline stages, with when they happened.
  stages: { status: string; at: Date | null }[];
};

export type GroupStat = {
  key: string;
  n: number;
  interviews: number;
  rejected: number;
  waiting: number;
  withdrawn: number;
  heardBack: number;
};

export type Finding = { tone: "good" | "bad" | "early"; text: string };

export type ResultsSummary = {
  total: number;
  interviews: number;
  offers: number;
  rejected: number;
  waiting: number;
  withdrawn: number;
  medianWaitDays: number | null;
  silent: { id: string; company: string; title: string; days: number }[];
  byRoute: GroupStat[];
  byCv: GroupStat[];
  bySource: GroupStat[];
  rejections: { id: string; company: string; days: number | null; route: string; cv: string; ats: number | null; afterInterview: boolean }[];
  progressed: { id: string; company: string; title: string; route: string; outcome: Outcome }[];
  network: { sent: number; replies: number; intros: number; calls: number };
  posts: { published: number; impressions: number; reactions: number; comments: number };
  findings: Finding[];
};

const OFFER = ["offer", "offer-accepted", "offer-declined"];

export function outcomeOf(a: AppRow): Outcome {
  const seen = new Set([a.status, ...a.stages.map((s) => s.status)]);
  if (OFFER.some((o) => seen.has(o))) return "offer";
  if (seen.has("interview")) return "interview";
  if (a.status === "rejected") return "rejected";
  if (a.status === "withdrawn") return "withdrawn";
  return "waiting";
}

export function routeOf(a: AppRow): string {
  if (a.outreach === "referred") return "Referral";
  if (a.outreach === "replied") return "Reached out, they replied";
  if (a.outreach === "sent" || a.outreach === "no_reply") return "Reached out, no reply";
  return "No reach-out logged";
}

/** The CV that went out with the application (not the one on file now). */
export function cvOf(a: AppRow, target = CV_TARGET): string {
  if (a.sentCv === "generic") return "Generic CV";
  if (a.sentCv === "tailored")
    return (a.sentAts ?? 0) >= target ? `Tailored CV (${target}%+)` : `Tailored, below ${target}%`;
  return "CV not recorded";
}

const days = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));

function group(apps: AppRow[], keyOf: (a: AppRow) => string): GroupStat[] {
  const m = new Map<string, GroupStat>();
  for (const a of apps) {
    const key = keyOf(a);
    const g = m.get(key) ?? { key, n: 0, interviews: 0, rejected: 0, waiting: 0, withdrawn: 0, heardBack: 0 };
    const o = outcomeOf(a);
    g.n++;
    if (o === "interview" || o === "offer") g.interviews++;
    if (o === "rejected") g.rejected++;
    if (o === "waiting") g.waiting++;
    if (o === "withdrawn") g.withdrawn++;
    if (o !== "waiting" && o !== "withdrawn") g.heardBack++;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summarizeResults(input: {
  apps: AppRow[];
  network: ResultsSummary["network"];
  posts: ResultsSummary["posts"];
  now?: Date;
  atsTarget?: number;
}): ResultsSummary {
  const target = input.atsTarget ?? CV_TARGET;
  const now = input.now ?? new Date();
  const apps = input.apps;
  const outcomes = apps.map((a) => ({ a, o: outcomeOf(a) }));
  const count = (o: Outcome) => outcomes.filter((x) => x.o === o).length;

  const waitingDays = outcomes
    .filter((x) => x.o === "waiting" && x.a.appliedAt && !x.a.followUpOff)
    .map((x) => ({ a: x.a, d: days(x.a.appliedAt!, now) }))
    .sort((p, q) => q.d - p.d);
  const sortedDays = waitingDays.map((w) => w.d).sort((p, q) => p - q);
  const medianWaitDays = sortedDays.length ? sortedDays[Math.floor((sortedDays.length - 1) / 2)] : null;

  const rejections = outcomes
    .filter((x) => x.o === "rejected")
    .map(({ a }) => {
      const rej = a.stages.find((s) => s.status === "rejected" && s.at)?.at ?? null;
      return {
        id: a.id,
        company: a.company,
        days: a.appliedAt && rej ? days(a.appliedAt, rej) : null,
        route: routeOf(a),
        cv: cvOf(a, target),
        ats: a.sentAts ?? null,
        afterInterview: a.stages.some((s) => s.status === "interview"),
      };
    });

  const progressed = outcomes
    .filter((x) => x.o === "interview" || x.o === "offer")
    .map(({ a, o }) => ({ id: a.id, company: a.company, title: a.title, route: routeOf(a), outcome: o }));

  const summary: ResultsSummary = {
    total: apps.length,
    interviews: count("interview") + count("offer"),
    offers: count("offer"),
    rejected: count("rejected"),
    waiting: count("waiting"),
    withdrawn: count("withdrawn"),
    medianWaitDays,
    silent: waitingDays.filter((w) => w.d >= SILENT_DAYS).map((w) => ({ id: w.a.id, company: w.a.company, title: w.a.title, days: w.d })),
    byRoute: group(apps, routeOf),
    byCv: group(apps, (a) => cvOf(a, target)),
    bySource: group(apps, (a) => a.source ?? "Unknown"),
    rejections,
    progressed,
    network: input.network,
    posts: input.posts,
    findings: [],
  };
  summary.findings = findingsFor(summary, target);
  return summary;
}

/** Plain sentences: what's working, what isn't, and what's too early to say. */
export function findingsFor(s: ResultsSummary, target = CV_TARGET): Finding[] {
  const f: Finding[] = [];
  const decided = s.interviews + s.rejected;

  if (s.total === 0) return [{ tone: "early", text: "No applications yet, so nothing to measure." }];

  // Interviews.
  if (s.interviews > 0) {
    const routes = [...new Set(s.progressed.map((p) => p.route))].filter((r) => r !== "No reach-out logged");
    f.push({
      tone: "good",
      text: `${plural(s.interviews, "application")} reached an interview (${s.progressed.map((p) => p.company).join(", ")})${routes.length ? `, via ${routes.join(", ").toLowerCase()}` : ""}.`,
    });
  }
  const sent = s.total - s.withdrawn;
  if (sent >= 10 && s.interviews <= 1) {
    f.push({
      tone: "bad",
      text: `${plural(s.interviews, "interview")} from ${plural(sent, "application")}${s.withdrawn ? ` (not counting ${s.withdrawn} withdrawn)` : ""}. Applying isn't producing conversations yet.`,
    });
  }

  // Rejections: how fast, and before or after talking to anyone.
  const early = s.rejections.filter((r) => !r.afterInterview);
  if (early.length >= 3) {
    const known = early.filter((r) => r.days != null).map((r) => r.days!);
    const avg = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
    const referrals = early.filter((r) => r.route === "Referral").length;
    f.push({
      tone: "bad",
      text:
        `${early.length} of ${s.rejected} rejections came before any interview${avg != null ? `, about ${avg} days after applying` : ""}. ` +
        `That's the CV screen or the fit, not how you interview.` +
        (referrals
          ? ` ${referrals === 1 ? "One of them was a referral" : `${referrals} of them were referrals`}, so a referral alone isn't getting the CV past the screen.`
          : ""),
    });
  }

  // Which CV the answered applications went out with.
  if (s.rejected >= 3) {
    const generic = s.rejections.filter((r) => r.cv === "Generic CV");
    const ats = generic.map((r) => r.ats).filter((x): x is number => x != null);
    if (generic.length === s.rejections.length)
      f.push({
        tone: "bad",
        text: `All ${s.rejected} rejections went out with the generic CV${ats.length ? ` (${Math.min(...ats)}–${Math.max(...ats)}% ATS where scored)` : ""}. Send only tailored CVs at ${target}%+.`,
      });
  }
  const tailoredSent = s.byCv.filter((g) => g.key.startsWith("Tailored"));
  const tailoredN = tailoredSent.reduce((a, g) => a + g.n - g.withdrawn, 0);
  const tailoredAnswered = tailoredSent.reduce((a, g) => a + g.heardBack, 0);
  if (tailoredN && !tailoredAnswered)
    f.push({
      tone: "early",
      text: `${plural(tailoredN, "application")} went out with a tailored CV; no answer yet. That's the test of whether tailoring works.`,
    });

  // Silence.
  if (s.silent.length) {
    f.push({
      tone: "bad",
      text: `${plural(s.silent.length, "application")} silent for ${SILENT_DAYS}+ days (${s.silent.map((x) => x.company).join(", ")}). Follow up with someone there, or let them go.`,
    });
  }

  // Routes and CVs: only compare when both groups are big enough.
  const compare = (groups: GroupStat[], what: string) => {
    const big = groups.filter((g) => g.n - g.waiting - g.withdrawn >= MIN_GROUP);
    if (big.length >= 2) {
      const rate = (g: GroupStat) => pct(g.interviews, g.n - g.waiting - g.withdrawn);
      const best = [...big].sort((a, b) => rate(b) - rate(a))[0];
      const worst = [...big].sort((a, b) => rate(a) - rate(b))[0];
      if (rate(best) - rate(worst) >= 20)
        f.push({ tone: "good", text: `${best.key}: ${rate(best)}% of decided applications reached an interview, against ${rate(worst)}% for ${worst.key.toLowerCase()}.` });
      else f.push({ tone: "early", text: `By ${what}, no clear difference yet.` });
    } else {
      const sizes = groups.map((g) => `${g.key} ${g.n}`).join(", ");
      f.push({ tone: "early", text: `By ${what}: too few decided applications to compare (${sizes}). Needs ${MIN_GROUP}+ answers in each.` });
    }
  };
  compare(s.byRoute, "route (cold, reached out, referral)");
  compare(s.byCv, "CV (generic or tailored)");

  // Network.
  if (s.network.sent > 0) {
    const r = pct(s.network.replies, s.network.sent);
    f.push({
      tone: r >= 30 ? "good" : s.network.sent >= MIN_GROUP ? "bad" : "early",
      text: `${s.network.replies} of ${s.network.sent} messages got a reply (${r}%)${s.network.intros ? `, and ${plural(s.network.intros, "intro")} came from them` : ""}.`,
    });
  } else {
    f.push({ tone: "bad", text: "No messages to people logged yet. Conversations come from people more often than from postings." });
  }

  // LinkedIn.
  if (s.posts.published === 0) f.push({ tone: "early", text: "No LinkedIn posts published yet, so nothing to measure there." });
  else
    f.push({
      tone: "early",
      text: `${plural(s.posts.published, "post")} published: ${s.posts.impressions} impressions, ${s.posts.reactions} reactions, ${s.posts.comments} comments.`,
    });

  if (decided < MIN_GROUP)
    f.push({ tone: "early", text: `Only ${plural(decided, "answer")} so far (interviews plus rejections). Most of what's below is still noise.` });

  return f;
}
