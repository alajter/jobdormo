// One-off: fills Job.postedAt for jobs saved before the column existed.
// Web-agent jobs carry "Posted: YYYY-MM-DD" in their description; automation
// jobs are matched by URL against a fresh fetch of their source.
//
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/backfill-posted.ts
import prisma from "@/lib/db";
import { ATS_PROVIDERS } from "@/lib/scraper/ats/registry";
import { parseAtsConfig } from "@/lib/scraper/automation-run/config";
import { normalizeJobUrl } from "@/lib/scraper/utils";
import { parsePostedDate } from "@/lib/jobs/postedDate";
import type { JobBoard } from "@/models/automation.model";

async function main() {
  let fromText = 0;
  let fromSource = 0;
  const missing = await prisma.job.findMany({ where: { postedAt: null } });
  for (const j of missing) {
    const m = j.description.match(/Posted:\s*(\d{4}-\d{2}-\d{2})/);
    const d = m ? parsePostedDate(m[1]) : null;
    if (d) {
      await prisma.job.update({ where: { id: j.id }, data: { postedAt: d } });
      fromText++;
    }
  }

  for (const a of await prisma.automation.findMany()) {
    const provider = ATS_PROVIDERS[a.jobBoard as JobBoard];
    const cfg = parseAtsConfig(a.sourceConfig, a.jobBoard as JobBoard);
    if (!provider || !cfg) continue;
    const jobs = await prisma.job.findMany({ where: { automationId: a.id, postedAt: null, jobUrl: { not: null } } });
    if (jobs.length === 0) continue;
    const byUrl = new Map(jobs.map((j) => [normalizeJobUrl(j.jobUrl!), j.id]));
    const { jobs: fetched } = await provider.search(cfg.companies, { targetTitles: cfg.targetTitles });
    for (const f of fetched) {
      const id = f.url ? byUrl.get(normalizeJobUrl(f.url)) : undefined;
      const d = parsePostedDate(f.postedDate);
      if (id && d) {
        await prisma.job.update({ where: { id }, data: { postedAt: d } });
        byUrl.delete(normalizeJobUrl(f.url));
        fromSource++;
      }
    }
    console.log(`${a.name}: ${jobs.length - byUrl.size} of ${jobs.length} dated`);
  }
  console.log(`Done: ${fromText} from descriptions, ${fromSource} from sources.`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
