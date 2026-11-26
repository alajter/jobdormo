import "server-only";
import prisma from "@/lib/db";
import { normalizeSearchRules, type SearchRules } from "@/models/searchRules.model";

/** The user's Search rules, with defaults for anything not set. */
export async function getSearchRulesFor(userId: string): Promise<SearchRules> {
  const row = await prisma.userSettings.findUnique({ where: { userId }, select: { settings: true } });
  try {
    return normalizeSearchRules(row ? JSON.parse(row.settings)?.searchRules : null);
  } catch {
    return normalizeSearchRules(null);
  }
}

export async function saveSearchRulesFor(userId: string, input: unknown): Promise<SearchRules> {
  const rules = normalizeSearchRules(input as Partial<Record<keyof SearchRules, unknown>>);
  const row = await prisma.userSettings.findUnique({ where: { userId }, select: { settings: true } });
  let settings: Record<string, unknown> = {};
  try {
    settings = row ? JSON.parse(row.settings) : {};
  } catch {
    settings = {};
  }
  const next = JSON.stringify({ ...settings, searchRules: rules });
  await prisma.userSettings.upsert({ where: { userId }, update: { settings: next }, create: { userId, settings: next } });
  return rules;
}
