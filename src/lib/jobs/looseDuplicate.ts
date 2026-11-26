// Catches a job already on the board under a slightly different name, which
// the exact company+title check misses. Example: "Team8 (stealth cyber
// startup) · Founding Product Lead" vs "Team8 · Team8 Stealth Cyber Startup -
// Founding Product Lead".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// First word of the company: "Team8 (stealth startup)" -> "team8".
const companyKey = (s: string) => norm(s.trim().split(/[\s(,-]+/)[0] ?? "");

export type BoardJob = { company: string; title: string };

/** The board job this find duplicates, if any. */
export function findLooseDuplicate<T extends BoardJob>(find: BoardJob, board: T[]): T | undefined {
  const key = companyKey(find.company);
  if (!key) return undefined;
  const title = norm(find.title);
  return board.find((b) => {
    if (companyKey(b.company) !== key) return false;
    const other = norm(b.title);
    if (other === title) return true;
    // One title is the other with a prefix, and that prefix names the
    // company: "Team8 Stealth Cyber Startup - X" vs "X". A prefix without
    // the company ("Senior") is a different job.
    const [long, short] = title.length > other.length ? [title, other] : [other, title];
    if (!short || !long.endsWith(short)) return false;
    return long.slice(0, long.length - short.length).includes(key);
  });
}
