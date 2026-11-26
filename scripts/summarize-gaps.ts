// Groups the "Missing" and "Partial" requirements from every open job's full
// match into the gaps that repeat most, with advice, and saves a GapReport
// (shown as "What you're missing" on My Jobs).
//
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/summarize-gaps.ts <userEmail>
import { generateText } from "ai";
import prisma from "@/lib/db";
import { getModel } from "@/lib/ai";
import { parseMatchGaps } from "@/lib/jobs/matchGaps";
import { getUserAiSettings } from "@/lib/scraper/runner";
import { getDefaultModelForProvider } from "@/lib/scraper/automation-run/aiSettings";
import { parseGapClusters } from "@/models/gapReport.model";

const OPEN = ["new", "draft", "applied", "interview"];

const SYSTEM = `You group a job seeker's requirement gaps across many job matches.
Merge items that mean the same thing (e.g. "5+ years as PM", "formal Product Manager title", "PM tenure at a scaled company" are one gap).
Return ONLY a JSON array (no prose, no code fences), most frequent first, at most 12 items:
[{"gap": "short plain name of the gap", "advice": "one or two sentences on how to address it honestly: reframe real experience, prepare for interviews, or learn it. Never suggest claiming experience the person doesn't have.", "jobIds": ["..."]}]
Only include a gap if it appears in at least 2 jobs, unless there are fewer than 10 jobs.
Use single quotes, never double quotes, inside string values.`;

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: summarize-gaps.ts <userEmail>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const jobs = await prisma.job.findMany({
    where: { userId: user.id, Status: { value: { in: OPEN } } },
    include: { Company: true, JobTitle: true, Status: true },
  });
  const withGaps = jobs
    .map((j) => ({ j, g: parseMatchGaps(j.matchData) }))
    .filter(({ g }) => g.missing.length + g.partial.length > 0);
  if (withGaps.length === 0) {
    console.log("No matched jobs with gaps; nothing to summarize.");
    await prisma.$disconnect();
    process.exit(0);
  }

  const input = withGaps
    .map(({ j, g }) => `id=${j.id} | ${j.Company.label} | ${j.JobTitle.label}\n  missing: ${g.missing.join("; ") || "-"}\n  partial: ${g.partial.join("; ") || "-"}`)
    .join("\n");

  const ai = await getUserAiSettings(user.id);
  const modelName = ai.model || getDefaultModelForProvider(ai.provider);
  const model = await getModel(ai.provider, modelName, user.id);
  let raw: { gap: string; advice: string; jobIds: string[] }[] | null = null;
  // One retry: a model occasionally returns JSON with an unescaped quote.
  for (let attempt = 1; attempt <= 2 && !raw; attempt++) {
    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: `Jobs and their gaps:\n${input}`,
      temperature: 0.2,
    });
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    try {
      raw = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : [];
    } catch (e) {
      console.log(`attempt ${attempt}: bad JSON (${e instanceof Error ? e.message : e})`);
    }
  }
  if (!raw) throw new Error("model returned invalid JSON twice");
  const byId = new Map(withGaps.map(({ j }) => [j.id, j]));
  const clusters = raw.map((c) => ({
    gap: c.gap,
    advice: c.advice,
    jobs: (c.jobIds ?? [])
      .filter((id) => byId.has(id))
      .map((id) => ({ id, company: byId.get(id)!.Company.label, title: byId.get(id)!.JobTitle.label })),
  }));
  const valid = parseGapClusters(JSON.stringify(clusters))
    .filter((c) => c.jobs.length > 0);

  await prisma.gapReport.create({
    data: { userId: user.id, jobCount: withGaps.length, data: JSON.stringify(valid) },
  });
  for (const c of valid) console.log(`GAP   | ${String(c.jobs.length).padStart(2)} | ${c.gap}`);
  console.log(`Saved report: ${valid.length} gaps across ${withGaps.length} jobs.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
