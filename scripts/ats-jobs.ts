// ATS keyword scores for open jobs: generic CV and tailored CV.
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/ats-jobs.ts <email>
// Scores jobs without stored keywords; ALL=1 rescores every open job (reusing
// stored keywords, so CV edits show up without new AI calls).
import prisma from "@/lib/db";
import { scoreJobAts } from "@/lib/cv/ats";

const OPEN = ["new", "draft", "applied", "interview", "offer"];

async function main() {
  const email = process.argv[2] || process.env.JOBSYNC_USER_EMAIL;
  if (!email) throw new Error("usage: ats-jobs.ts <email>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const all = process.env.ALL === "1";
  const jobs = await prisma.job.findMany({
    where: { userId: user.id, Status: { value: { in: OPEN } }, ...(all ? {} : { atsKeywords: null }) },
    include: { Company: true, JobTitle: true },
  });
  let done = 0;
  for (const j of jobs) {
    try {
      const r = await scoreJobAts(user.id, j.id);
      if (!r) {
        console.log(`SKIP  | ${j.Company.label} | ${j.JobTitle.label} | no usable posting text`);
        continue;
      }
      done++;
      console.log(`ATS   | ${String(r.base ?? "-").padStart(3)} → ${String(r.tailored ?? "-").padStart(3)} | ${j.Company.label} | ${j.JobTitle.label}`);
    } catch (e) {
      console.log(`ERROR | ${j.Company.label} | ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${done} scored of ${jobs.length}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
