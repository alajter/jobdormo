// Fills in the company profile (description, areas, stage, size, website)
// for companies on the user's open jobs that don't have one yet. A Claude CLI
// agent researches them on the web in batches and returns JSON.
//
//   npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/enrich-companies.ts <userEmail>
//
// ALL=1 refreshes every company on an open job.
import { execFileSync } from "child_process";
import prisma from "@/lib/db";
import { COMPANY_AREAS, normalizeCompanyAreas } from "@/models/companyArea.model";

const OPEN = ["new", "draft", "applied", "interview"];
const BATCH = 15;

type Profile = {
  name?: string;
  description?: string;
  areas?: string[];
  stage?: string | null;
  size?: string | null;
  website?: string | null;
};

export function parseProfiles(raw: string): Profile[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : [];
}

function brief(companies: { name: string; hint: string }[]): string {
  const areaList = Object.entries(COMPANY_AREAS).map(([code, label]) => `${code} (${label})`).join(", ");
  return `Research these companies on the web (their own site, funding news, LinkedIn company page found via search). Do not log in anywhere.

Companies (name, then a hint from the job posting):
${companies.map((c, i) => `${i + 1}. ${c.name} | ${c.hint}`).join("\n")}

Return ONLY a JSON array (no prose, no code fences), one item per company, same names:
{"name": "...", "description": "1-2 plain sentences: what the company does and for whom", "areas": [codes], "stage": "seed | series A | series B | series C | series D+ | public | acquired | bootstrapped | unknown", "size": "approximate employees, e.g. 11-50, 51-200, 201-500, 501-1000, 1000+", "website": "https://..."}
Area codes, pick one to three: ${areaList}.
Facts only. If you can't find a company with confidence, set description to "" and areas to [].`;
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: enrich-companies.ts <userEmail>");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const companies = await prisma.company.findMany({
    where: {
      createdBy: user.id,
      ...(process.env.ALL ? {} : { profileUpdatedAt: null }),
      jobsApplied: { some: { userId: user.id, Status: { value: { in: OPEN } } } },
    },
    include: { jobsApplied: { select: { jobUrl: true, JobTitle: { select: { label: true } } }, take: 1 } },
  });
  console.log(`Enriching ${companies.length} companies`);

  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, i + BATCH);
    const input = batch.map((c) => ({
      name: c.label,
      hint: [c.jobsApplied[0]?.JobTitle?.label, c.jobsApplied[0]?.jobUrl, c.websiteUrl].filter(Boolean).join(" · "),
    }));
    let out = "";
    try {
      out = execFileSync(
        "claude",
        ["-p", brief(input), "--allowedTools", "WebSearch,WebFetch,mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch", "--output-format", "text"],
        { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, timeout: 15 * 60_000 },
      );
    } catch (e) {
      console.log(`ERROR | batch ${i / BATCH + 1} | ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      continue;
    }
    const profiles = parseProfiles(out);
    for (const c of batch) {
      const p = profiles.find((x) => x.name?.trim().toLowerCase() === c.label.trim().toLowerCase());
      if (!p) {
        console.log(`MISS  | ${c.label}`);
        continue;
      }
      const areas = normalizeCompanyAreas(p.areas);
      await prisma.company.update({
        where: { id: c.id },
        data: {
          description: p.description?.trim() || null,
          areas,
          stage: p.stage && p.stage !== "unknown" ? p.stage : null,
          size: p.size || c.size,
          websiteUrl: c.websiteUrl ?? (p.website?.startsWith("http") ? p.website : null),
          profileUpdatedAt: new Date(),
        },
      });
      console.log(`OK    | ${c.label} | ${areas.join(",")} | ${p.stage ?? ""} | ${p.size ?? ""}`);
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
