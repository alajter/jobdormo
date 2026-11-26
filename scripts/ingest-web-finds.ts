// Adds jobs found by the daily web-search agent to a user's board.
//
//   npx tsx --env-file=.env scripts/ingest-web-finds.ts <finds.json> <userEmail>
//
// <finds.json> is the agent's JSON array ({company, title, url, location,
// workplaceType, track, why, posted, description}). Each item goes through
// createJobFromNames, so the board's own duplicate check applies; duplicates
// are skipped, not added twice. Prints one line per item.
import { readFileSync } from "fs";
import prisma from "@/lib/db";
import { createJobFromNames } from "@/lib/jobs/createJobFromNames";
import { parsePostedDate } from "@/lib/jobs/postedDate";
import { findLooseDuplicate } from "@/lib/jobs/looseDuplicate";

type Find = {
  company?: string;
  title?: string;
  url?: string;
  location?: string;
  workplaceType?: string | null;
  track?: string;
  why?: string;
  posted?: string | null;
  description?: string;
};


export function parseFinds(raw: string): Find[] {
  // Tolerate prose or code fences around the array.
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : [];
}

async function main() {
  const [file, email] = process.argv.slice(2);
  if (!file || !email) throw new Error("usage: ingest-web-finds.ts <finds.json> <userEmail>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const finds = parseFinds(readFileSync(file, "utf8"));
  let added = 0;
  // Every job on the board, archived ones too, for the loose duplicate check.
  const board = (
    await prisma.job.findMany({
      where: { userId: user.id },
      select: { Company: { select: { label: true } }, JobTitle: { select: { label: true } } },
    })
  ).map((j) => ({ company: j.Company.label, title: j.JobTitle.label }));
  for (const f of finds) {
    if (!f.company || !f.title) continue;
    const dup = findLooseDuplicate({ company: f.company, title: f.title }, board);
    if (dup) {
      console.log(`SKIP  | ${f.company} | ${f.title} | already on board as ${dup.company} · ${dup.title}`);
      continue;
    }
    const wt = (f.workplaceType ?? "").toLowerCase();
    // createJobFromNames renders Markdown (raw HTML is escaped), so build
    // Markdown, not HTML.
    const description = [
      f.description ?? "",
      f.why ? `**Why it fits:** ${f.why}` : "",
      f.posted ? `Posted: ${f.posted}` : "",
      `_Found by the daily web-search agent${f.track === "B" ? " (customer-facing product target)" : f.track === "C" ? " (AI transformation track)" : ""}._`,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      const r = await createJobFromNames(
        {
          company: f.company,
          jobTitle: f.title,
          jobDescription: description,
          location: f.location || undefined,
          source: "Web search agent",
          jobType: "FT",
          workplaceType: ["remote", "hybrid", "onsite"].includes(wt) ? wt : undefined,
          status: "new",
          jobUrl: f.url || undefined,
          createdVia: "daily-web-agent",
          postedAt: parsePostedDate(f.posted),
        } as Parameters<typeof createJobFromNames>[0],
        user.id,
      );
      if (r.jobId && !r.duplicateOf) {
        added++;
        board.push({ company: f.company, title: f.title });
        console.log(`ADDED | ${f.company} | ${f.title} | ${f.location ?? ""}`);
      } else {
        console.log(`SKIP  | ${f.company} | ${f.title} | ${r.duplicateOf ? "already on board" : r.message ?? ""}`);
      }
    } catch (e) {
      console.log(`ERROR | ${f.company} | ${f.title} | ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${added} added of ${finds.length} found.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
