// Runs every active automation once, outside the Next app (whose in-process
// scheduler only fires while the app is running).
//
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/run-automations.ts
//
// The tsconfig maps "server-only" to the test stub so server modules load in
// plain Node.
import prisma from "@/lib/db";
import { runAutomation, AutomationAlreadyRunningError } from "@/lib/scraper/runner";
import { ATS_BOARDS } from "@/models/automation.model";

async function main() {
  const automations = await prisma.automation.findMany({
    where: {
      status: "active",
      jobBoard: { in: ATS_BOARDS },
      // ONLY=<name prefix> runs a subset, e.g. ONLY="Product:".
      ...(process.env.ONLY ? { name: { startsWith: process.env.ONLY } } : {}),
    },
    include: { resume: true },
  });
  for (const a of automations) {
    if (!a.resume) {
      console.log(`SKIP  | ${a.name} | no resume`);
      continue;
    }
    const started = new Date();
    try {
      await runAutomation(a);
      const run = await prisma.automationRun.findFirst({
        where: { automationId: a.id, startedAt: { gte: started } },
        orderBy: { startedAt: "desc" },
      });
      console.log(
        `RUN   | ${a.name} | ${run?.status} | fetched ${run?.jobsSearched} | new ${run?.jobsDeduplicated} | saved ${run?.jobsSaved}${run?.errorMessage ? ` | ${run.errorMessage}` : ""}`,
      );
    } catch (e) {
      const msg = e instanceof AutomationAlreadyRunningError ? "already running" : e instanceof Error ? e.message : String(e);
      console.log(`ERROR | ${a.name} | ${msg}`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
