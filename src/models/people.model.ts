// Job-search outreach to people (not jobs): pipeline statuses, activity
// kinds, LinkedIn posts, the connections-export parser and the "who to
// contact first" ranking. Pure, client-safe.

export const PEOPLE_STATUSES = {
  to_contact: { label: "To contact", className: "bg-muted text-foreground" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  replied: { label: "Replied", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  call: { label: "Call / meeting", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  intro: { label: "Intro / referral", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
} as const;
export type PeopleStatus = keyof typeof PEOPLE_STATUSES;
export const PEOPLE_STATUS_CODES = Object.keys(PEOPLE_STATUSES) as PeopleStatus[];
export const isPeopleStatus = (v: unknown): v is PeopleStatus =>
  typeof v === "string" && v in PEOPLE_STATUSES;

export const PEOPLE_ACTIVITY_KINDS = {
  sent: "Sent a message",
  reply: "They replied",
  call: "Call / meeting",
  intro: "Intro / referral made",
  note: "Note",
} as const;
export type PeopleActivityKind = keyof typeof PEOPLE_ACTIVITY_KINDS;
export const isPeopleActivityKind = (v: unknown): v is PeopleActivityKind =>
  typeof v === "string" && v in PEOPLE_ACTIVITY_KINDS;

// What each logged activity moves the person to. A note changes nothing.
export const ACTIVITY_STATUS: Record<PeopleActivityKind, PeopleStatus | null> = {
  sent: "sent",
  reply: "replied",
  call: "call",
  intro: "intro",
  note: null,
};

// Activities that count as a real conversation for the weekly goal.
export const CONVERSATION_KINDS: PeopleActivityKind[] = ["reply", "call", "intro"];
export const WEEKLY_CONVERSATION_GOAL = 5;
// Days until the follow-up after sending a message.
export const FOLLOW_UP_DAYS = 7;

export const PEOPLE_CHANNELS = {
  linkedin: "LinkedIn",
  email: "Email",
  whatsapp: "WhatsApp",
  phone: "Phone",
  other: "Other",
} as const;
export type PeopleChannel = keyof typeof PEOPLE_CHANNELS;
export const isPeopleChannel = (v: unknown): v is PeopleChannel =>
  typeof v === "string" && v in PEOPLE_CHANNELS;

export const POST_STATUSES = {
  idea: { label: "Idea", className: "bg-muted text-foreground" },
  draft: { label: "Draft", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  posted: { label: "Posted", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
} as const;
export type PostStatus = keyof typeof POST_STATUSES;
export const POST_STATUS_CODES = Object.keys(POST_STATUSES) as PostStatus[];
export const isPostStatus = (v: unknown): v is PostStatus =>
  typeof v === "string" && v in POST_STATUSES;

// ---------- LinkedIn connections export (Connections.csv) ----------

export type LinkedinConnection = {
  name: string;
  linkedinUrl: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: Date | null;
};

// One CSV line into fields, with quoted fields ("Acme, Inc.") and "" escapes.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// "24 Nov 2026" (LinkedIn's format) or anything Date can read.
function parseConnectedOn(s: string): Date | null {
  const m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(s.trim());
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return new Date(Date.UTC(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])));
  }
  const d = new Date(s);
  return s && !isNaN(+d) ? d : null;
}

/**
 * Parses LinkedIn's Connections.csv. The file starts with a few "Notes:"
 * lines before the real header, so the header is found by its columns.
 */
export function parseLinkedinConnections(csv: string): LinkedinConnection[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);
  const headerAt = lines.findIndex((l) => /first name/i.test(l) && /last name/i.test(l));
  if (headerAt < 0) return [];
  const header = splitCsvLine(lines[headerAt]).map((h) => h.toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name);
  const [first, last, url, email, company, position, connected] = [
    col("first name"), col("last name"), col("url"), col("email address"),
    col("company"), col("position"), col("connected on"),
  ];
  const get = (f: string[], i: number) => (i >= 0 && f[i] ? f[i] : null);
  const out: LinkedinConnection[] = [];
  for (const line of lines.slice(headerAt + 1)) {
    if (!line.trim()) continue;
    const f = splitCsvLine(line);
    const name = [get(f, first), get(f, last)].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const connectedOn = get(f, connected);
    out.push({
      name,
      linkedinUrl: get(f, url),
      email: get(f, email),
      company: get(f, company),
      position: get(f, position),
      connectedOn: connectedOn ? parseConnectedOn(connectedOn) : null,
    });
  }
  return out;
}

// ---------- Who to contact first ----------

const RULES: { re: RegExp; points: number; why: string }[] = [
  { re: /\b(co-?founder|founder|ceo|chief executive)\b/i, points: 35, why: "founder / CEO" },
  { re: /\b(talent partner|head of talent)\b/i, points: 30, why: "VC / talent" },
  // "Partner" and "principal" as investor titles, not "Partner Manager" or
  // "Principal Solutions Engineer".
  {
    re: /\b(general partner|managing partner|venture partner|investor|vc|partner(?!\s*(manager|success|marketing|sales|engineer|alliances|program|solutions|account))|principal(?=\s*($|[,@|·]|at\b)))/i,
    points: 35,
    why: "investor",
  },
  { re: /\b(cto|chief technology)\b/i, points: 25, why: "CTO" },
  { re: /\b(chief product|cpo|vp,? product|head of product|director of product|product lead)\b/i, points: 25, why: "product leader" },
  { re: /\b(recruit|headhunt|talent acquisition)\b/i, points: 15, why: "recruiter" },
  { re: /\b(vp|vice president|head of|director|chief)\b/i, points: 10, why: "senior" },
];
const DOMAIN = /\b(secur|cyber|appsec|ai\b|agent|llm|genai)/i;
const VC_COMPANY = /\b(ventures?|capital|partners|vc|fund)\b/i;

/**
 * 0-100 score for "contact this person first" and a short reason. Founders,
 * investors and product leaders score highest; working at a company on the
 * board (a target) adds a lot; security / AI adds a little.
 */
export function rankContact(
  position: string | null | undefined,
  company: string | null | undefined,
  targetCompanies: Set<string>,
): { priority: number; reason: string } {
  const pos = position ?? "";
  const co = company ?? "";
  let score = 0;
  const why: string[] = [];
  const rule = RULES.find((r) => r.re.test(pos));
  if (rule) {
    score += rule.points;
    why.push(rule.why);
  } else if (VC_COMPANY.test(co)) {
    score += 25;
    why.push("at a VC");
  }
  if (co && targetCompanies.has(normalizeCompany(co))) {
    score += 35;
    why.push(`works at ${co} (open job there)`);
  }
  if (DOMAIN.test(`${pos} ${co}`)) {
    score += 10;
    why.push("security / AI");
  }
  return { priority: Math.min(100, score), reason: why.join(" · ") };
}

export const normalizeCompany = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\b(inc|ltd|llc|gmbh|corp|corporation|limited|technologies|security)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Monday 00:00 (local) of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}
