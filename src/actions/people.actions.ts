"use server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { requireUser } from "./shared";
import { candidateContext, userModel, VOICE } from "@/lib/people/voice";
import {
  ACTIVITY_STATUS,
  CONVERSATION_KINDS,
  FOLLOW_UP_DAYS,
  PEOPLE_STATUS_CODES,
  isPeopleActivityKind,
  isPeopleChannel,
  isPeopleStatus,
  normalizeCompany,
  parseLinkedinConnections,
  rankContact,
  startOfWeek,
  type PeopleActivityKind,
} from "@/models/people.model";

// People in the job search: the network pipeline (who to contact, what was
// sent, who replied, follow-ups), the LinkedIn connections import, and
// messages drafted in the user's voice. Every query is scoped to the user.

export type PersonRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  companyId: string | null;
  relationship: string | null;
  linkedinUrl: string | null;
  email: string | null;
  channel: string | null;
  notes: string | null;
  outreachStatus: string | null;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  source: string | null;
  priority: number | null;
  priorityReason: string | null;
  lastActivity: { kind: string; at: Date; text: string | null } | null;
};

const PERSON_SELECT = {
  id: true,
  name: true,
  title: true,
  companyName: true,
  companyId: true,
  Company: { select: { label: true } },
  relationship: true,
  linkedinUrl: true,
  email: true,
  channel: true,
  notes: true,
  outreachStatus: true,
  nextFollowUpAt: true,
  lastContactedAt: true,
  source: true,
  priority: true,
  priorityReason: true,
  activities: { orderBy: { at: "desc" as const }, take: 1, select: { kind: true, at: true, text: true } },
};

type PersonSelected = {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
  companyId: string | null;
  Company: { label: string } | null;
  relationship: string | null;
  linkedinUrl: string | null;
  email: string | null;
  channel: string | null;
  notes: string | null;
  outreachStatus: string | null;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  source: string | null;
  priority: number | null;
  priorityReason: string | null;
  activities: { kind: string; at: Date; text: string | null }[];
};

const toRow = (c: PersonSelected): PersonRow => ({
  id: c.id,
  name: c.name,
  title: c.title,
  company: c.Company?.label ?? c.companyName,
  companyId: c.companyId,
  relationship: c.relationship,
  linkedinUrl: c.linkedinUrl,
  email: c.email,
  channel: c.channel,
  notes: c.notes,
  outreachStatus: c.outreachStatus,
  nextFollowUpAt: c.nextFollowUpAt,
  lastContactedAt: c.lastContactedAt,
  source: c.source,
  priority: c.priority,
  priorityReason: c.priorityReason,
  lastActivity: c.activities[0] ?? null,
});

const clean = (s: unknown, max: number) =>
  typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null;

/**
 * The people list. "pipeline" = people with an outreach status (follow-ups
 * due first); "suggested" = connections not contacted yet, best first.
 */
const OPEN = ["new", "draft", "applied", "interview", "offer"];

/** Normalised names of companies where you have an open job (not archived or closed). */
async function openJobCompanies(userId: string): Promise<Set<string>> {
  const rows = await prisma.job.findMany({
    where: { userId, Status: { value: { in: OPEN } } },
    select: { Company: { select: { label: true } } },
  });
  return new Set(rows.map((j) => normalizeCompany(j.Company.label)).filter(Boolean));
}

/**
 * "Suggested to contact", ranked now against the jobs you're pursuing today
 * (the stored score is from the last import). Returns ids best first, with
 * the fresh score and reason.
 */
async function rankSuggested(userId: string, where: Record<string, unknown>, take: number) {
  const [targets, light] = await Promise.all([
    openJobCompanies(userId),
    prisma.contact.findMany({
      where,
      select: { id: true, name: true, title: true, companyName: true, Company: { select: { label: true } } },
    }),
  ]);
  return light
    .map((c) => ({ id: c.id, name: c.name, ...rankContact(c.title, c.Company?.label ?? c.companyName, targets) }))
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name))
    .slice(0, take);
}

export const getPeople = async (input: {
  view: "pipeline" | "suggested";
  status?: string;
  search?: string;
  limit?: number;
}): Promise<{ success: boolean; data: PersonRow[]; total: number; counts: Record<string, number> }> => {
  try {
    const user = await requireUser();
    const where: Record<string, unknown> = { createdBy: user.id };
    if (input.view === "pipeline") {
      where.outreachStatus = isPeopleStatus(input.status) ? input.status : { not: null };
    } else {
      where.outreachStatus = null;
    }
    const q = input.search?.trim().slice(0, 100);
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { Company: { label: { contains: q, mode: "insensitive" } } },
      ];
    }
    const take = Math.min(Math.max(input.limit ?? 200, 1), 500);
    if (input.view === "suggested") {
      const [ranked, total, groups] = await Promise.all([
        rankSuggested(user.id, where, take),
        prisma.contact.count({ where }),
        prisma.contact.groupBy({ by: ["outreachStatus"], where: { createdBy: user.id }, _count: { _all: true } }),
      ]);
      const rows = await prisma.contact.findMany({ where: { createdBy: user.id, id: { in: ranked.map((r) => r.id) } }, select: PERSON_SELECT });
      const byId = new Map(rows.map((r) => [r.id, toRow(r)]));
      const data: PersonRow[] = [];
      for (const r of ranked) {
        const row = byId.get(r.id);
        if (row) data.push({ ...row, priority: r.priority, priorityReason: r.reason || null });
      }
      const counts: Record<string, number> = {};
      for (const g of groups) counts[g.outreachStatus ?? "none"] = g._count._all;
      return { success: true, data, total, counts };
    }
    const [rows, total, groups] = await Promise.all([
      prisma.contact.findMany({
        where,
        select: PERSON_SELECT,
        take,
        orderBy:
          input.view === "pipeline"
            ? [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }]
            : [{ priority: { sort: "desc", nulls: "last" } }, { name: "asc" }],
      }),
      prisma.contact.count({ where }),
      prisma.contact.groupBy({
        by: ["outreachStatus"],
        where: { createdBy: user.id },
        _count: { _all: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.outreachStatus ?? "none"] = g._count._all;
    return { success: true, data: rows.map(toRow), total, counts };
  } catch {
    return { success: false, data: [], total: 0, counts: {} };
  }
};

// Links the free-text employer to a Company on the board when one matches.
async function resolveCompany(userId: string, company: string | null) {
  if (!company) return { companyId: null, companyName: null };
  const companies = await prisma.company.findMany({
    where: { createdBy: userId },
    select: { id: true, label: true },
  });
  const key = normalizeCompany(company);
  const hit = key ? companies.find((c) => normalizeCompany(c.label) === key) : undefined;
  return hit ? { companyId: hit.id, companyName: null } : { companyId: null, companyName: company };
}

/** Adds or edits a person. */
export const savePerson = async (input: {
  id?: string;
  name: string;
  title?: string;
  company?: string;
  relationship?: string;
  linkedinUrl?: string;
  email?: string;
  channel?: string;
  notes?: string;
  outreachStatus?: string | null;
  nextFollowUpAt?: string | null;
}): Promise<{ success: boolean; id?: string; message?: string }> => {
  try {
    const user = await requireUser();
    const name = clean(input.name, 120);
    if (!name) return { success: false, message: "Add a name." };
    const { companyId, companyName } = await resolveCompany(user.id, clean(input.company, 120));
    const followUp = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
    const data = {
      name,
      title: clean(input.title, 160),
      companyId,
      companyName,
      relationship: clean(input.relationship, 500),
      linkedinUrl: clean(input.linkedinUrl, 300),
      email: clean(input.email, 200),
      channel: isPeopleChannel(input.channel) ? input.channel : null,
      notes: clean(input.notes, 4000),
      outreachStatus: isPeopleStatus(input.outreachStatus) ? input.outreachStatus : null,
      nextFollowUpAt: followUp && !isNaN(+followUp) ? followUp : null,
    };
    if (input.id) {
      const res = await prisma.contact.updateMany({ where: { id: input.id, createdBy: user.id }, data });
      if (res.count === 0) return { success: false, message: "Person not found." };
      return { success: true, id: input.id };
    }
    const created = await prisma.contact.create({ data: { ...data, source: "manual", createdBy: user.id } });
    return { success: true, id: created.id };
  } catch {
    return { success: false, message: "Couldn't save." };
  }
};

/** Moves a person in the pipeline (null = take them out of it). */
export const setPersonStatus = async (id: string, status: string | null): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    if (status !== null && !isPeopleStatus(status)) return { success: false };
    const res = await prisma.contact.updateMany({
      where: { id, createdBy: user.id },
      data: { outreachStatus: status, ...(status === "closed" || status === null ? { nextFollowUpAt: null } : {}) },
    });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};

export const setPersonFollowUp = async (id: string, date: string | null): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    const d = date ? new Date(date) : null;
    if (d && isNaN(+d)) return { success: false };
    const res = await prisma.contact.updateMany({ where: { id, createdBy: user.id }, data: { nextFollowUpAt: d } });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};

// Pipeline order: logging an earlier step never moves a person backwards
// (a follow-up message after they replied keeps them at "replied").
const ORDER = ["to_contact", "sent", "replied", "call", "intro"];

/** Logs what happened (sent, reply, call, intro, note) and moves the pipeline. */
export const logPersonActivity = async (input: {
  contactId: string;
  kind: string;
  channel?: string;
  text?: string;
  at?: string;
}): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    if (!isPeopleActivityKind(input.kind)) return { success: false };
    const person = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: user.id },
      select: { id: true, outreachStatus: true },
    });
    if (!person) return { success: false };
    const at = input.at ? new Date(input.at) : new Date();
    const when = isNaN(+at) ? new Date() : at;
    await prisma.contactActivity.create({
      data: {
        contactId: person.id,
        userId: user.id,
        kind: input.kind,
        channel: isPeopleChannel(input.channel) ? input.channel : null,
        text: clean(input.text, 6000),
        at: when,
      },
    });
    const next = ACTIVITY_STATUS[input.kind as PeopleActivityKind];
    const current = person.outreachStatus;
    const forward = next && (current === null || current === "closed" || ORDER.indexOf(next) > ORDER.indexOf(current));
    const followUp =
      input.kind === "sent"
        ? new Date(when.getTime() + FOLLOW_UP_DAYS * 86400000)
        : input.kind === "note"
          ? undefined
          : null;
    await prisma.contact.updateMany({
      where: { id: person.id, createdBy: user.id },
      data: {
        ...(forward ? { outreachStatus: next } : {}),
        ...(followUp !== undefined ? { nextFollowUpAt: followUp } : {}),
        ...(input.kind !== "note" ? { lastContactedAt: when } : {}),
        ...(isPeopleChannel(input.channel) ? { channel: input.channel } : {}),
      },
    });
    return { success: true };
  } catch {
    return { success: false };
  }
};

export const getPersonActivities = async (
  contactId: string,
): Promise<{ id: string; kind: string; channel: string | null; text: string | null; at: Date }[]> => {
  try {
    const user = await requireUser();
    return await prisma.contactActivity.findMany({
      where: { contactId, userId: user.id },
      orderBy: { at: "desc" },
      select: { id: true, kind: true, channel: true, text: true, at: true },
    });
  } catch {
    return [];
  }
};

export const deletePerson = async (id: string): Promise<{ success: boolean }> => {
  try {
    const user = await requireUser();
    const res = await prisma.contact.deleteMany({ where: { id, createdBy: user.id } });
    return { success: res.count === 1 };
  } catch {
    return { success: false };
  }
};

/** People the user knows at a company (for the job page). */
// Who you know at each of these companies, best first (contact priority).
// Exact match on the company (linked id, or the name LinkedIn gave),
// normalised, so "OX Security" doesn't pick up people at Fox or Box.
async function knownAt(
  userId: string,
  companies: { id: string; label: string }[],
  perCompany: number,
): Promise<Map<string, { count: number; people: PersonRow[] }>> {
  const ids = new Set(companies.map((c) => c.id));
  const byKey = new Map(companies.map((c) => [normalizeCompany(c.label), c.id] as const).filter(([k]) => k));
  const light = await prisma.contact.findMany({
    where: { createdBy: userId, OR: [{ companyId: { in: [...ids] } }, { companyName: { not: null } }] },
    select: { id: true, companyId: true, companyName: true, priority: true },
  });
  const matched = new Map<string, { id: string; priority: number }[]>();
  for (const c of light) {
    const cid = c.companyId && ids.has(c.companyId) ? c.companyId : c.companyName ? byKey.get(normalizeCompany(c.companyName)) : undefined;
    if (!cid) continue;
    matched.set(cid, [...(matched.get(cid) ?? []), { id: c.id, priority: c.priority ?? 0 }]);
  }
  const wanted = [...matched.values()].flatMap((l) => l.sort((a, b) => b.priority - a.priority).slice(0, perCompany).map((x) => x.id));
  const rows = wanted.length
    ? await prisma.contact.findMany({ where: { createdBy: userId, id: { in: wanted } }, select: PERSON_SELECT })
    : [];
  const rowById = new Map(rows.map((r) => [r.id, toRow(r)]));
  const out = new Map<string, { count: number; people: PersonRow[] }>();
  for (const [cid, list] of matched) {
    out.set(cid, {
      count: list.length,
      people: list
        .slice(0, perCompany)
        .map((x) => rowById.get(x.id))
        .filter((r): r is PersonRow => !!r),
    });
  }
  return out;
}

export const getPeopleAtCompany = async (companyId: string): Promise<PersonRow[]> => {
  try {
    const user = await requireUser();
    const company = await prisma.company.findFirst({
      where: { id: companyId, createdBy: user.id },
      select: { id: true, label: true },
    });
    if (!company) return [];
    return (await knownAt(user.id, [company], 30)).get(company.id)?.people ?? [];
  } catch {
    return [];
  }
};

/** Who you know at each company (by id): the count and the best few. */
export const getPeopleAtCompanies = async (
  companyIds: string[],
  perCompany = 3,
): Promise<Record<string, { count: number; people: PersonRow[] }>> => {
  try {
    const user = await requireUser();
    const companies = await prisma.company.findMany({
      where: { createdBy: user.id, id: { in: companyIds.slice(0, 300) } },
      select: { id: true, label: true },
    });
    return Object.fromEntries(await knownAt(user.id, companies, Math.min(10, Math.max(1, perCompany))));
  } catch {
    return {};
  }
};

/** How many LinkedIn connections are in Jobdormo, and when the newest was connected. */
export const getConnectionsSummary = async (): Promise<{ count: number; newest: Date | null }> => {
  try {
    const user = await requireUser();
    const [count, newest] = await Promise.all([
      prisma.contact.count({ where: { createdBy: user.id, source: "linkedin" } }),
      prisma.contact.findFirst({
        where: { createdBy: user.id, source: "linkedin", connectedOn: { not: null } },
        select: { connectedOn: true },
        orderBy: { connectedOn: "desc" },
      }),
    ]);
    return { count, newest: newest?.connectedOn ?? null };
  } catch {
    return { count: 0, newest: null };
  }
};

/**
 * Imports LinkedIn's Connections.csv: new people are added (not in the
 * pipeline), everyone gets a "contact first" score. Manual edits are kept.
 */
export const importLinkedinConnections = async (
  csv: string,
): Promise<{ success: boolean; added?: number; updated?: number; message?: string }> => {
  try {
    const user = await requireUser();
    if (typeof csv !== "string" || csv.length > 10_000_000) return { success: false, message: "File too large." };
    const people = parseLinkedinConnections(csv);
    if (!people.length) {
      return { success: false, message: "No connections found. Use Connections.csv from LinkedIn's data export." };
    }
    const companies = await prisma.company.findMany({ where: { createdBy: user.id }, select: { id: true, label: true } });
    // Companies with a job on the board are the targets.
    const targets = await openJobCompanies(user.id);
    const byKey = new Map(companies.map((c) => [normalizeCompany(c.label), c.id]));
    const existing = await prisma.contact.findMany({
      where: { createdBy: user.id },
      select: { id: true, name: true, linkedinUrl: true, source: true },
    });
    const sourceOf = new Map(existing.map((e) => [e.id, e.source]));
    const byUrl = new Map(existing.filter((e) => e.linkedinUrl).map((e) => [e.linkedinUrl!.toLowerCase(), e.id]));
    const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e.id]));

    let added = 0;
    let updated = 0;
    const toCreate = [];
    for (const p of people) {
      const { priority, reason } = rankContact(p.position, p.company, targets);
      const companyId = p.company ? byKey.get(normalizeCompany(p.company)) ?? null : null;
      const id = (p.linkedinUrl && byUrl.get(p.linkedinUrl.toLowerCase())) || byName.get(p.name.toLowerCase());
      if (id) {
        // People change jobs: for contacts that came from LinkedIn, the new
        // export's company and title win. Contacts added by hand keep theirs.
        const fromLinkedin = sourceOf.get(id) === "linkedin";
        await prisma.contact.updateMany({
          where: { id, createdBy: user.id },
          data: {
            priority,
            priorityReason: reason || null,
            connectedOn: p.connectedOn,
            linkedinUrl: p.linkedinUrl ?? undefined,
            ...(fromLinkedin && p.company
              ? { companyId, companyName: companyId ? null : p.company.slice(0, 120), title: p.position?.slice(0, 160) ?? null }
              : {}),
          },
        });
        updated++;
      } else {
        toCreate.push({
          name: p.name.slice(0, 120),
          title: p.position?.slice(0, 160) ?? null,
          companyId,
          companyName: companyId ? null : p.company?.slice(0, 120) ?? null,
          linkedinUrl: p.linkedinUrl,
          email: p.email,
          connectedOn: p.connectedOn,
          source: "linkedin",
          channel: "linkedin",
          priority,
          priorityReason: reason || null,
          createdBy: user.id,
        });
      }
    }
    for (let i = 0; i < toCreate.length; i += 500) {
      const res = await prisma.contact.createMany({ data: toCreate.slice(i, i + 500) });
      added += res.count;
    }
    return { success: true, added, updated };
  } catch {
    return { success: false, message: "Import failed." };
  }
};

const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "me";

const GOALS: Record<string, string> = {
  reconnect: "Reconnect and say the writer is looking for their next role (what kind, from their notes); ask if the recipient knows of something or someone worth talking to.",
  intro: "Ask for an intro to someone specific (named in the writer's extra notes).",
  referral: "Ask the recipient to refer the writer or pass their CV for a role at the recipient's company.",
  followup: "A short, friendly follow-up to the writer's last message, without pressure.",
  thanks: "Thank them for their help or reply.",
};

/** Drafts a message to a person, in the user's voice. */
export const draftPersonMessage = async (input: {
  contactId: string;
  channel: string;
  goal: string;
  extra?: string;
}): Promise<{ success: boolean; text?: string; message?: string }> => {
  try {
    const user = await requireUser();
    const person = await prisma.contact.findFirst({
      where: { id: input.contactId, createdBy: user.id },
      select: { ...PERSON_SELECT, activities: { orderBy: { at: "desc" as const }, take: 5, select: { kind: true, at: true, text: true } } },
    });
    if (!person) return { success: false, message: "Person not found." };
    const channel = isPeopleChannel(input.channel) ? input.channel : "linkedin";
    const length =
      channel === "email"
        ? "An email: a 'Subject: ...' line, a blank line, then a body of 60 to 150 words."
        : channel === "whatsapp"
          ? "A WhatsApp message: 2 to 5 short lines, casual."
          : "A LinkedIn message: 50 to 120 words.";
    const history = person.activities
      .map((a) => `${a.at.toISOString().slice(0, 10)} ${a.kind}${a.text ? `: ${a.text.slice(0, 600)}` : ""}`)
      .join("\n");
    const { notes, cv, examples } = await candidateContext(user.id);
    const model = await userModel(user.id);
    const prompt = `Format: ${length}
To: ${person.name}${person.title ? `, ${person.title}` : ""}${person.Company?.label || person.companyName ? ` at ${person.Company?.label ?? person.companyName}` : ""}
How they know them (their words): ${person.relationship || "not stated; don't invent any"}
Goal: ${GOALS[input.goal] ?? GOALS.reconnect}
${input.extra?.trim() ? `Their extra notes for this message: ${input.extra.trim().slice(0, 1000)}\n` : ""}${history ? `Earlier contact with this person (newest first):\n${history}\n` : ""}
Their notes and rules:
${notes}

Their CV:
${cv.slice(0, 6000)}

Messages they actually sent (match this voice and length, not their facts):
${examples}`;
    const res = await generateText({
      model,
      system: `${VOICE}\n- Open with "Hi <first name>," and sign off "${firstName(user.name)}" (no sign-off for WhatsApp beyond their name if the examples do).\n- One clear ask at the end.`,
      prompt,
      temperature: 0.4,
    });
    return { success: true, text: res.text.trim().replace(/^["']|["']$/g, "") };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Couldn't draft the message." };
  }
};

/** Everything the "Job search" page shows. */
export const getSearchHQ = async () => {
  try {
    const user = await requireUser();
    const now = new Date();
    const weekStart = startOfWeek(now);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const [conversations, sentThisWeek, due, pipelineGroups, newJobs, posts, lastPosted] = await Promise.all([
      // One conversation per person per week, however many replies.
      prisma.contactActivity.findMany({
        where: { userId: user.id, at: { gte: weekStart }, kind: { in: CONVERSATION_KINDS } },
        distinct: ["contactId"],
        select: { contactId: true },
      }),
      prisma.contactActivity.count({ where: { userId: user.id, at: { gte: weekStart }, kind: "sent" } }),
      prisma.contact.findMany({
        where: { createdBy: user.id, nextFollowUpAt: { lte: endOfToday }, outreachStatus: { notIn: ["closed"] } },
        select: PERSON_SELECT,
        orderBy: { nextFollowUpAt: "asc" },
        take: 30,
      }),
      prisma.contact.groupBy({
        by: ["outreachStatus"],
        where: { createdBy: user.id, outreachStatus: { not: null } },
        _count: { _all: true },
      }),
      prisma.job.findMany({
        where: { userId: user.id, matchScore: { gte: 70 }, Status: { value: "new" } },
        select: { id: true, matchScore: true, JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
        orderBy: { matchScore: "desc" },
        take: 10,
      }),
      prisma.linkedinPost.findMany({
        where: { userId: user.id, status: { in: ["idea", "draft"] } },
        select: { id: true, topic: true, body: true, status: true, updatedAt: true, scheduledFor: true },
        // Next planned posts first.
        orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: 5,
      }),
      prisma.linkedinPost.findFirst({
        where: { userId: user.id, status: "posted" },
        select: { postedAt: true },
        orderBy: { postedAt: "desc" },
      }),
    ]);
    const pipeline: Record<string, number> = {};
    for (const s of PEOPLE_STATUS_CODES) pipeline[s] = 0;
    for (const g of pipelineGroups) if (g.outreachStatus) pipeline[g.outreachStatus] = g._count._all;
    return {
      success: true as const,
      data: {
        weekStart,
        conversations: conversations.length,
        sentThisWeek,
        due: due.map(toRow),
        pipeline,
        newJobs: newJobs.map((j) => ({ id: j.id, score: j.matchScore, title: j.JobTitle.label, company: j.Company.label })),
        posts,
        lastPostedAt: lastPosted?.postedAt ?? null,
      },
    };
  } catch {
    return { success: false as const };
  }
};

