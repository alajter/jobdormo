// Morning tailoring: a tailored CV for each open job that doesn't have one,
// best matches first, and a report of what's below the ATS target.
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/tailor-jobs.ts <email>
// ONLY="Acme,Globex" limits it to those companies (re-tailors them even if
// they already have a CV); MAX caps how many (default 8).
import prisma from "@/lib/db";
import { ATS_TARGET, tailorCvForJob } from "@/lib/cv/tailor";

async function main() {
  const email = process.argv[2] || process.env.JOBSYNC_USER_EMAIL;
  if (!email) throw new Error("usage: tailor-jobs.ts <email>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const only = (process.env.ONLY ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const max = Number(process.env.MAX ?? 8);
  const jobs = await prisma.job.findMany({
    where: {
      userId: user.id,
      Status: { value: { in: only.length ? ["new", "draft", "applied", "interview"] : ["new"] } },
      ...(only.length ? {} : { tailoredCv: null, matchScore: { gte: 60 } }),
    },
    include: { Company: true, JobTitle: true },
    orderBy: { matchScore: { sort: "desc", nulls: "last" } },
  });
  const picked = (only.length ? jobs.filter((j) => only.some((o) => j.Company.label.toLowerCase().startsWith(o))) : jobs).slice(0, max);
  let ready = 0;
  for (const j of picked) {
    try {
      const r = await tailorCvForJob(user.id, j.id);
      const high = r.review.filter((i) => i.severity === "high");
      const ok = r.ats.after >= ATS_TARGET && high.length === 0;
      if (ok) ready++;
      console.log(`${ok ? "READY" : "BELOW"} | ${String(r.ats.before).padStart(3)} → ${String(r.ats.after).padStart(3)} | ${j.Company.label} | ${j.JobTitle.label} | ${r.pages}p${r.ats.missing.length && r.ats.after < ATS_TARGET ? ` | missing: ${r.ats.missing.join(", ")}` : ""}${high.length ? ` | must fix: ${high.map((i) => i.quote.slice(0, 60)).join(" / ")}` : ""}`);
    } catch (e) {
      console.log(`ERROR | ${j.Company.label} | ${j.JobTitle.label} | ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`Done: ${picked.length} tailored, ${ready} at ${ATS_TARGET}%+.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
