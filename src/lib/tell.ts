// "Tell Jobdormo": turns one line about what happened ("Acme rejected me",
// "sent Dana the intro note", a pasted posting) into concrete changes the owner
// confirms. Pure: the prompt text, parsing the model's JSON, and checking
// every reference against the owner's own jobs and people.

export const TELL_JOB_STATUSES = ["applied", "interview", "offer", "rejected", "withdrawn", "archived"] as const;
export const TELL_OUTREACH = ["sent", "replied", "referred", "no_reply"] as const;
export const TELL_ACTIVITIES = ["sent", "reply", "call", "intro", "note"] as const;

type JobStatusCode = (typeof TELL_JOB_STATUSES)[number];
type OutreachCode = (typeof TELL_OUTREACH)[number];
type ActivityCode = (typeof TELL_ACTIVITIES)[number];

export type TellChange =
  | { kind: "job_status"; jobId: string; status: JobStatusCode; label: string }
  | { kind: "job_outreach"; jobId: string; outreach: OutreachCode; label: string }
  | { kind: "job_note"; jobId: string; text: string; label: string }
  | { kind: "job_no_follow_up"; jobId: string; label: string }
  | { kind: "person_log"; personId: string; activity: ActivityCode; text: string; label: string }
  | { kind: "person_follow_up"; personId: string; date: string; label: string }
  | { kind: "add_job"; company: string; title: string; location?: string; url?: string; label: string };

export type TellPlan = { summary: string; changes: TellChange[]; question: string | null };

export type TellJobRef = { id: string; company: string; title: string; status: string };
export type TellPersonRef = { id: string; name: string; company: string | null };

const STATUS_LABEL: Record<JobStatusCode, string> = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};
const OUTREACH_LABEL: Record<OutreachCode, string> = {
  sent: "reach-out sent",
  replied: "they replied",
  referred: "referred",
  no_reply: "no reply",
};
const ACTIVITY_LABEL: Record<ActivityCode, string> = {
  sent: "you sent a message",
  reply: "they replied",
  call: "call / meeting",
  intro: "intro made",
  note: "note",
};

export function tellSystemPrompt(today: string): string {
  return `You turn the user's short update about their job search into changes to their tracker. Today is ${today}.
Jobs are listed as J<number>, people as P<number>. Only use those references; never invent one.
Possible changes:
- {"kind":"job_status","job":"J3","status":"applied|interview|offer|rejected|withdrawn|archived"}
- {"kind":"job_outreach","job":"J3","outreach":"sent|replied|referred|no_reply"} (their reach-out to someone about that job)
- {"kind":"job_note","job":"J3","text":"short note in their words"}
- {"kind":"job_no_follow_up","job":"J3"} when they say they won't follow up on that job
- {"kind":"person_log","person":"P2","activity":"sent|reply|call|intro|note","text":"what happened, short"}
- {"kind":"person_follow_up","person":"P2","date":"YYYY-MM-DD"}
- {"kind":"add_job","company":"...","title":"...","location":"...","url":"..."} only when they pasted a job posting or asked to add a role.
Rules:
- Do only what they said. A rejection is job_status rejected; an interview invite is job_status interview plus a job_note with any date or name they gave.
- "Sent a note/message to X" is person_log sent for that person (and job_outreach sent when it's about a job). If they say when to follow up, add person_follow_up.
- If a name or company matches nothing in the lists, or matches more than one, don't guess: leave it out and ask one short question.
- Notes are short and factual, in their words. No advice. Write relative dates as the actual date ("next Tuesday" -> "Tue 1 Dec").
Return ONLY JSON: {"summary":"one short line of what you understood","changes":[...],"question":null or "one short question"}`;
}

export function tellPrompt(text: string, jobs: TellJobRef[], people: TellPersonRef[]): string {
  return `Their update:
"""
${text.slice(0, 12000)}
"""

Their jobs:
${jobs.map((j, i) => `J${i + 1}: ${j.company} · ${j.title} (${j.status})`).join("\n") || "(none)"}

Their people:
${people.map((p, i) => `P${i + 1}: ${p.name}${p.company ? ` (${p.company})` : ""}`).join("\n") || "(none)"}`;
}

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null;
const pickRef = <T>(ref: unknown, prefix: "J" | "P", list: T[]): T | null => {
  const m = typeof ref === "string" ? ref.trim().match(new RegExp(`^${prefix}(\\d+)$`)) : null;
  if (!m) return null;
  return list[Number(m[1]) - 1] ?? null;
};

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Parses the model's answer; drops anything that doesn't point at the owner's own data. */
export function parseTellPlan(raw: string, jobs: TellJobRef[], people: TellPersonRef[]): TellPlan {
  const data = extractJson(raw) as { summary?: unknown; changes?: unknown; question?: unknown } | null;
  if (!data) return { summary: "", changes: [], question: "I didn't get that. Say it another way?" };
  const changes: TellChange[] = [];
  const jobName = (j: TellJobRef) => `${j.company} · ${j.title}`;
  for (const c of Array.isArray(data.changes) ? (data.changes as Record<string, unknown>[]) : []) {
    if (!c || typeof c !== "object") continue;
    const job = pickRef(c.job, "J", jobs);
    const person = pickRef(c.person, "P", people);
    switch (c.kind) {
      case "job_status": {
        const status = oneOf(c.status, TELL_JOB_STATUSES);
        if (job && status) changes.push({ kind: "job_status", jobId: job.id, status, label: `${jobName(job)} → ${STATUS_LABEL[status]}` });
        break;
      }
      case "job_outreach": {
        const outreach = oneOf(c.outreach, TELL_OUTREACH);
        if (job && outreach)
          changes.push({ kind: "job_outreach", jobId: job.id, outreach, label: `${jobName(job)}: ${OUTREACH_LABEL[outreach]}` });
        break;
      }
      case "job_note": {
        const text = str(c.text, 2000);
        if (job && text) changes.push({ kind: "job_note", jobId: job.id, text, label: `Note on ${jobName(job)}: ${text}` });
        break;
      }
      case "job_no_follow_up": {
        if (job) changes.push({ kind: "job_no_follow_up", jobId: job.id, label: `${jobName(job)}: no more follow-up reminders` });
        break;
      }
      case "person_log": {
        const activity = oneOf(c.activity, TELL_ACTIVITIES);
        const text = str(c.text, 2000);
        if (person && activity)
          changes.push({
            kind: "person_log",
            personId: person.id,
            activity,
            text,
            label: `${person.name}: ${ACTIVITY_LABEL[activity]}${text ? `: ${text}` : ""}`,
          });
        break;
      }
      case "person_follow_up": {
        const date = str(c.date, 10);
        if (person && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(+new Date(date)))
          changes.push({ kind: "person_follow_up", personId: person.id, date, label: `Follow up with ${person.name} on ${date}` });
        break;
      }
      case "add_job": {
        const company = str(c.company, 120);
        const title = str(c.title, 200);
        const url = str(c.url, 800);
        const location = str(c.location, 120);
        if (company && title)
          changes.push({
            kind: "add_job",
            company,
            title,
            ...(location ? { location } : {}),
            ...(/^https?:\/\//.test(url) ? { url } : {}),
            label: `Add job: ${company} · ${title}`,
          });
        break;
      }
    }
  }
  const question = str(data.question, 300) || null;
  return { summary: str(data.summary, 300), changes, question };
}
