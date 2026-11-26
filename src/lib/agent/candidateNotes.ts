import "server-only";
import db from "@/lib/db";

// The candidate's own facts and rules (Settings → candidate notes), read by
// the recruiter review and the cover letter. Ownership-scoped by userId; a
// missing or malformed settings row just means no notes.
export async function readCandidateNotes(userId: string): Promise<string | undefined> {
  try {
    const row = await db.userSettings.findUnique({ where: { userId } });
    if (!row) return undefined;
    const candidate = JSON.parse(row.settings)?.candidate;
    // The user's own notes first, then facts gathered by Improve my CV.
    const text = [candidate?.notes, candidate?.facts]
      .filter((s): s is string => typeof s === "string" && !!s.trim())
      .join("\n\n");
    return text || undefined;
  } catch {
    return undefined;
  }
}
