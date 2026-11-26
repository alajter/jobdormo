// Loads a fictional demo into an EMPTY database: a product manager, "Sam
// Rivera", with CVs, jobs in every state, people, LinkedIn posts and enough
// history for Results. Everything is invented.
//
//   1. Point DATABASE_URL at a new database and run the migrations.
//   2. Set CV_DIR=demo/cv, JOBSYNC_USER_EMAIL=demo@jobdormo.test and a
//      DEMO_PASSWORD in .env.
//   3. npx tsx --tsconfig scripts/tsconfig.jobs.json --env-file=.env scripts/demo-seed.ts
//
// Sign in with that email and DEMO_PASSWORD. Refuses to run if the user exists.
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import prisma from "@/lib/db";
import { signup } from "@/actions/auth.actions";
import { renderCvHtml, type StructuredCv } from "@/lib/cv/template";
import { cvPath, renderHtmlToPdf } from "@/lib/cv/tracks";

const DAY = 86_400_000;
const now = new Date();
const daysAgo = (n: number, h = 10) => {
  const d = new Date(now.getTime() - n * DAY);
  d.setHours(h, 0, 0, 0);
  return d;
};
const nextWeekday = (dow: number, h: number, m: number) => {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() !== dow);
  return d;
};

const BASE_CV: StructuredCv = {
  name: "Sam Rivera",
  headline: "Senior Product Manager · B2B SaaS, data and AI features",
  contact: ["Berlin", "sam.rivera@example.com", "linkedin.com/in/sam-rivera-demo"],
  summary:
    "Product manager who ships with customers. Seven years in product at B2B SaaS companies, after a start in Customer Success and engineering. I run discovery with design partners, turn it into a roadmap engineers believe in, and measure what changed.",
  experience: [
    {
      title: "Senior Product Manager",
      company: "Northwind Analytics",
      location: "Berlin",
      dates: "Mar 2022 – Present",
      bullets: [
        "Own the reporting and alerts product for 400 B2B customers: discovery, roadmap, specs and launch.",
        "Ran discovery with 15 design partners and shipped scheduled reports; weekly active accounts grew 18% in two quarters.",
        "Launched an AI summary feature with a human review step and an evaluation set of 300 real reports.",
        "Introduced usage-based pricing with Finance and Sales; expansion revenue up 22% year over year.",
      ],
    },
    {
      title: "Product Manager",
      company: "Globex Cloud",
      location: "Berlin",
      dates: "Jan 2019 – Feb 2022",
      bullets: [
        "Led the onboarding and permissions area of a developer platform used by 2,000 teams.",
        "Cut time to first deploy from three days to four hours by rebuilding onboarding with five customers.",
        "Wrote PRDs and ran sprint reviews with two engineering teams of eight.",
      ],
    },
    {
      title: "Customer Success Lead",
      company: "Initech",
      location: "Hamburg",
      dates: "Jun 2016 – Dec 2018",
      bullets: [
        "Managed 40 mid-market accounts with renewals above 92%.",
        "Turned recurring customer requests into a monthly product feedback review with the product team.",
      ],
    },
    {
      title: "Software Engineer",
      company: "Umbrella Systems",
      location: "Hamburg",
      dates: "Sep 2012 – May 2016",
      bullets: ["Built billing and reporting services in TypeScript and SQL."],
    },
  ],
  projects: [{ name: "changelog-cli", url: "https://example.com/changelog-cli", description: "An open-source CLI that drafts release notes from merged pull requests." }],
  education: [{ degree: "BSc Computer Science", school: "University of Hamburg", dates: "2008 – 2012" }],
  skills: [
    { label: "Product", items: "Discovery, design partners, roadmaps, PRDs, pricing, launches" },
    { label: "Data", items: "SQL, Amplitude, Looker, experiment design" },
    { label: "AI", items: "LLM features, evaluation sets, human-in-the-loop design" },
    { label: "Tools", items: "Linear, Jira, Figma, Notion" },
  ],
};

const AI_CV: StructuredCv = {
  ...BASE_CV,
  headline: "AI Product Manager · LLM features in B2B SaaS",
  summary:
    "Product manager who ships AI features customers trust. At Northwind I launched an AI summary feature with a human review step and an evaluation set built from real reports. Before that, product at a developer platform, Customer Success and engineering.",
};

function writeCv(rel: string, cv: StructuredCv) {
  const p = cvPath(rel)!;
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, renderCvHtml(cv), "utf8");
  return p;
}

const match = (score: number, summary: string, met: string[], partial: string[], missing: string[], tips: string[]) =>
  JSON.stringify({
    matchScore: score,
    recommendation: score >= 80 ? "strong match" : score >= 65 ? "good match" : score >= 50 ? "partial match" : "weak match",
    analyzed: true,
    body: `## Summary
${summary}

## Requirements
**Met**
${met.map((m) => `- ${m}`).join("\n")}

**Partial**
${partial.map((m) => `- ${m}`).join("\n") || "- None."}

**Missing**
${missing.map((m) => `- ${m}`).join("\n") || "- None outright."}

## Skills
**Matched:** discovery with design partners, roadmaps, PRDs, SQL, LLM features.

**Missing:** ${missing.length ? missing.map((m) => m.split(":")[0]).join(", ") : "nothing major"}.

## Deal Breakers
None identified.

## Tailoring Tips
${tips.map((t) => `- ${t}`).join("\n")}`,
  });

async function main() {
  const email = process.env.JOBSYNC_USER_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) throw new Error("Set JOBSYNC_USER_EMAIL and DEMO_PASSWORD in .env");
  if (await prisma.user.findUnique({ where: { email } })) throw new Error(`${email} already exists: use an empty database.`);
  const res = await signup({ name: "Sam Rivera", email, password });
  if (!("success" in res)) throw new Error(res.error);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const uid = user.id;

  // Settings: a local model (so setup is complete), notes, search rules.
  await prisma.userSettings.create({
    data: {
      userId: uid,
      settings: JSON.stringify({
        ai: { provider: "ollama", model: "qwen3.5:9b" },
        display: { theme: "system" },
        candidate: {
          notes:
            "Looking for: senior PM or founding PM roles at B2B SaaS or AI companies, 20 to 1,000 people, Berlin or remote in the EU.\nAvoid: pure growth-marketing roles, adtech.\nRules: I was never a Head of Product; don't call me one. Don't name Northwind's customers.\nFacts not in my CV: I ran the AI evaluation set with two engineers and our support lead.",
        },
        searchRules: { homeCity: "Berlin", nearbyCities: ["Potsdam"], maxCompanySize: 1000, seniorOnlyRoles: ["customer success"] },
      }),
    },
  });

  // CVs: one per kind of role, plus the ones made for jobs.
  writeFileSync(cvPath("tracks.json")!, "[]");
  writeCv("generic/product-manager.html", BASE_CV);
  writeCv("generic/ai-product-manager.html", AI_CV);
  writeFileSync(
    cvPath("tracks.json")!,
    JSON.stringify(
      [
        { id: "product-manager", label: "Product Manager", file: "generic/product-manager.html" },
        { id: "ai-product-manager", label: "AI Product Manager", file: "generic/ai-product-manager.html" },
      ],
      null,
      2,
    ),
  );

  const statuses = new Map((await prisma.jobStatus.findMany()).map((s) => [s.value, s.id]));
  const stageTypes = new Map(
    (await prisma.jobStageType.findMany({ where: { createdBy: uid }, select: { id: true, value: true } })).map((s) => [s.value, s.id]),
  );
  const source = await prisma.jobSource.findFirst({ where: { createdBy: uid, value: "linkedin" } });

  const company = (label: string, size: string, stage: string, areas: string[], description: string) =>
    prisma.company.create({
      data: { label, value: label.toLowerCase(), createdBy: uid, size, stage, areas, description, websiteUrl: "https://example.com" },
    });
  const title = (label: string) =>
    prisma.jobTitle.upsert({
      where: { value_createdBy: { value: label.toLowerCase(), createdBy: uid } },
      update: {},
      create: { label, value: label.toLowerCase(), createdBy: uid },
    });
  const location = (label: string) =>
    prisma.location.upsert({
      where: { value_createdBy: { value: label.toLowerCase(), createdBy: uid } },
      update: {},
      create: { label, value: label.toLowerCase(), createdBy: uid },
    });

  type JobSeed = {
    company: Awaited<ReturnType<typeof company>>;
    title: string;
    location: string;
    workplace: "HYBRID" | "REMOTE" | "ONSITE";
    status: string;
    track: string;
    postedDays?: number;
    match?: number;
    matchData?: string;
    atsBase?: number;
    tailored?: { ats: number; cv: StructuredCv };
    applied?: { days: number; cv: "tailored" | "generic" };
    outreach?: string;
    stages?: { value: string; days: number }[];
    description: string;
  };

  const vandelay = await company("Vandelay AI", "51-200", "series b", ["ai"], "Agents that handle procurement paperwork for mid-sized manufacturers.");
  const piedPiper = await company("Pied Piper", "11-50", "seed", ["ai", "devtools"], "Compression APIs for AI workloads; first product hire.");
  const tyrell = await company("Tyrell Cloud", "51-200", "series a", ["devtools"], "A developer platform for running data pipelines.");
  const cyberdyne = await company("Cyberdyne Security", "201-500", "series b", ["security"], "Detection and response for cloud workloads.");
  const stark = await company("Stark Data", "5001-10000", "public", ["data"], "Enterprise data warehouse vendor.");
  const initrode = await company("Initrode", "51-200", "series a", ["martech"], "Customer messaging for e-commerce.");
  const soylent = await company("Soylent Labs", "11-50", "seed", ["health"], "Nutrition planning for clinics.");
  const hooli = await company("Hooli Health", "201-500", "series c", ["health", "ai"], "Remote patient monitoring for insurers.");
  const acme = await company("Acme Robotics", "51-200", "series a", ["ai"], "Warehouse robots with a fleet management app.");
  const wayne = await company("Wayne Logistics", "501-1000", "series c", ["data"], "Freight visibility for shippers.");
  const oscorp = await company("Oscorp Bio", "201-500", "series b", ["health"], "Lab data platform.");
  const massive = await company("Massive Dynamic", "51-200", "series a", ["ai"], "Forecasting for energy retailers.");
  const aperture = await company("Aperture Labs", "11-50", "seed", ["devtools"], "Testing tools for APIs.");

  const jobs: JobSeed[] = [
    {
      company: vandelay, title: "Senior Product Manager, AI Agents", location: "Berlin", workplace: "HYBRID", status: "new", track: "ai-product-manager", postedDays: 3,
      match: 82, atsBase: 38, tailored: { ats: 88, cv: { ...AI_CV, headline: "Senior Product Manager · AI agents for B2B workflows" } },
      matchData: match(82, "Sam is a strong fit: shipped an AI feature with a human review step and an evaluation set, and runs discovery with design partners. The gap is agent orchestration at scale.",
        ["Shipped AI features in B2B SaaS: AI summaries with human review at Northwind.", "Design partner discovery: 15 partners for scheduled reports.", "Roadmap ownership: owns reporting and alerts end to end."],
        ["Agent orchestration: one AI feature, not a multi-step agent product."], [],
        ["Lead with the evaluation set and the human review step.", "Name the agent work as 'AI workflow' where true."]),
      description: "<p>Vandelay AI is hiring a Senior Product Manager for our agent platform.</p><p><strong>Requirements</strong></p><ul><li>5+ years of product management in B2B SaaS</li><li>Shipped LLM or AI features to customers</li><li>Discovery with design partners</li><li>Comfortable with SQL and evaluation metrics</li></ul>",
    },
    {
      company: piedPiper, title: "Founding Product Manager", location: "Berlin", workplace: "REMOTE", status: "new", track: "product-manager", postedDays: 6,
      match: 76, atsBase: 41, tailored: { ats: 79, cv: { ...BASE_CV, headline: "Product Manager · first product hire, developer platforms" } }, outreach: "replied",
      matchData: match(76, "Good fit for a first product hire: developer-platform onboarding, discovery with customers and an engineering background.",
        ["Developer platform experience at Globex Cloud.", "Engineering background: four years as a software engineer."], ["Founding experience: never the first PM at a company."], [],
        ["Say you've built a product function's habits (feedback review, PRDs) even without the title."]),
      description: "<p>Our first product hire. You'll own discovery and the roadmap.</p><p><strong>What you'll bring</strong></p><ul><li>Product experience with developer tools</li><li>An engineering background</li><li>Comfort working without process</li></ul>",
    },
    {
      company: tyrell, title: "Product Manager, Platform", location: "Berlin", workplace: "HYBRID", status: "new", track: "product-manager", postedDays: 2, match: 71, atsBase: 34,
      matchData: match(71, "Good fit on platform and onboarding work; the posting's data-pipeline vocabulary is missing from the CV.",
        ["Platform onboarding at Globex Cloud.", "Works with two engineering teams."], ["Data pipelines: reporting product, not pipeline tooling."], ["Kubernetes experience."],
        ["Use 'data platform' where the reporting work fits it."]),
      description: "<p>Own the platform experience for data engineers.</p><p><strong>Requirements</strong></p><ul><li>Platform or developer product experience</li><li>Data pipelines and orchestration</li><li>Kubernetes familiarity</li></ul>",
    },
    {
      company: cyberdyne, title: "Senior Product Manager, Detection", location: "Munich", workplace: "ONSITE", status: "new", track: "product-manager", postedDays: 5, match: 64, atsBase: 29,
      matchData: match(64, "Partial fit: strong B2B product skills, no security domain experience.", ["B2B roadmap ownership."], ["Enterprise security buyers: none directly."], ["Detection engineering experience."], ["Only apply if the domain is a real interest."]),
      description: "<p>Lead detection products for security teams.</p><ul><li>Security domain experience</li><li>Detection engineering</li></ul>",
    },
    { company: stark, title: "Group Product Manager", location: "Berlin", workplace: "HYBRID", status: "new", track: "product-manager", postedDays: 4, match: 69, atsBase: 33, description: "<p>Lead three product teams in our analytics group.</p>" },
    { company: initrode, title: "Customer Success Manager", location: "Berlin", workplace: "HYBRID", status: "new", track: "product-manager", postedDays: 1, match: 58, atsBase: 44, description: "<p>Manage a book of 60 customers.</p>" },
    { company: soylent, title: "Product Lead", location: "Berlin", workplace: "HYBRID", status: "new", track: "product-manager", postedDays: 1, description: "<p>Lead product at a seed-stage health startup.</p>" },
    {
      company: hooli, title: "Senior Product Manager, Growth", location: "Berlin", workplace: "HYBRID", status: "applied", track: "product-manager", match: 73, atsBase: 36,
      tailored: { ats: 81, cv: BASE_CV }, applied: { days: 9, cv: "tailored" }, outreach: "sent", stages: [{ value: "applied", days: 9 }],
      description: "<p>Grow activation for our member app.</p>",
    },
    {
      company: acme, title: "Product Manager", location: "Berlin", workplace: "ONSITE", status: "interview", track: "product-manager", match: 78, atsBase: 40,
      tailored: { ats: 84, cv: BASE_CV }, applied: { days: 12, cv: "tailored" }, outreach: "referred", stages: [{ value: "applied", days: 12 }, { value: "1st screening interview", days: 4 }],
      description: "<p>Own the fleet management app.</p>",
    },
    { company: wayne, title: "Product Manager, Data", location: "Berlin", workplace: "HYBRID", status: "applied", track: "product-manager", match: 66, atsBase: 31, applied: { days: 17, cv: "generic" }, stages: [{ value: "applied", days: 17 }], description: "<p>Data product for shippers.</p>" },
    { company: oscorp, title: "Senior Product Manager", location: "Berlin", workplace: "HYBRID", status: "rejected", track: "product-manager", match: 62, atsBase: 27, applied: { days: 21, cv: "generic" }, stages: [{ value: "applied", days: 21 }, { value: "rejected", days: 19 }], description: "<p>Lab data platform.</p>" },
    { company: massive, title: "Product Manager, Forecasting", location: "Berlin", workplace: "REMOTE", status: "rejected", track: "product-manager", match: 60, atsBase: 24, applied: { days: 15, cv: "generic" }, stages: [{ value: "applied", days: 15 }, { value: "rejected", days: 13 }], description: "<p>Forecasting product.</p>" },
    { company: aperture, title: "Product Manager", location: "Berlin", workplace: "REMOTE", status: "withdrawn", track: "product-manager", applied: { days: 25, cv: "generic" }, stages: [{ value: "applied", days: 25 }, { value: "withdrawn", days: 20 }], description: "<p>API testing tools.</p>" },
  ];

  const keywords = JSON.stringify(["product management", "B2B SaaS", "discovery", "design partners", "roadmap", "SQL", "LLM", "evaluation", "platform", "onboarding", "PRDs", "pricing"]);
  for (const j of jobs) {
    const [t, l] = await Promise.all([title(j.title), location(j.location)]);
    const file = j.tailored ? `jobs/Sam_Rivera_${j.company.label.replace(/\W+/g, "_")}.html` : null;
    if (j.tailored && file) writeCv(file, j.tailored.cv);
    const job = await prisma.job.create({
      data: {
        userId: uid,
        description: j.description,
        jobType: "FT",
        workplaceType: j.workplace,
        createdAt: daysAgo((j.postedDays ?? j.applied?.days ?? 3) + 1),
        statusId: statuses.get(j.status)!,
        jobTitleId: t.id,
        companyId: j.company.id,
        locationId: l.id,
        jobSourceId: source?.id,
        jobUrl: "https://example.com/careers",
        applied: !!j.applied,
        appliedDate: j.applied ? daysAgo(j.applied.days) : null,
        postedAt: j.postedDays != null ? daysAgo(j.postedDays) : null,
        matchScore: j.match ?? null,
        matchData: j.matchData ?? (j.match != null ? JSON.stringify({ matchScore: j.match, recommendation: "good match", analyzed: true, body: "## Summary\nA reasonable fit." }) : null),
        track: j.track,
        atsKeywords: j.atsBase != null ? keywords : null,
        atsBase: j.atsBase ?? null,
        atsTailored: j.tailored?.ats ?? null,
        atsCheckedAt: j.atsBase != null ? daysAgo(1) : null,
        tailoredCv: file,
        cvReview: j.tailored ? "[]" : null,
        cvReviewedAt: j.tailored ? daysAgo(1) : null,
        outreachStatus: j.outreach ?? null,
        outreachUpdatedAt: j.outreach ? daysAgo(2) : null,
        appliedCv: j.applied?.cv ?? null,
        appliedAts: j.applied ? (j.applied.cv === "tailored" ? (j.tailored?.ats ?? null) : (j.atsBase ?? null)) : null,
      },
    });
    for (const [i, s] of (j.stages ?? []).entries()) {
      const typeId = stageTypes.get(s.value);
      if (!typeId) continue;
      await prisma.jobStage.create({
        data: { jobId: job.id, stageTypeId: typeId, occurredAt: daysAgo(s.days), isCurrent: i === (j.stages!.length - 1) },
      });
    }
  }
  console.log(`jobs: ${jobs.length}`);

  // People: who you know, what was said, what's due.
  const person = (name: string, title: string, co: { id: string } | null, companyName: string | null, extra: Record<string, unknown> = {}) =>
    prisma.contact.create({ data: { name, title, companyId: co?.id ?? null, companyName, createdBy: uid, source: "linkedin", channel: "linkedin", ...extra } });
  const dana = await person("Dana Levi", "Head of Engineering", piedPiper, null, { relationship: "Worked together at Globex Cloud.", outreachStatus: "replied", nextFollowUpAt: daysAgo(0, 9), priority: 70, priorityReason: "works at Pied Piper (open job there)" });
  const priya = await person("Priya Nair", "Talent Partner", hooli, null, { outreachStatus: "sent", nextFollowUpAt: daysAgo(-2, 9), priority: 65, priorityReason: "VC / talent · works at Hooli Health (open job there)" });
  const tom = await person("Tom Becker", "VP Product", acme, null, { relationship: "Met at a product meetup in 2023.", outreachStatus: "intro", priority: 70, priorityReason: "product leader · works at Acme Robotics (open job there)" });
  await person("Ben Okafor", "Engineering Manager", vandelay, null, { priority: 45, priorityReason: "senior · works at Vandelay AI (open job there)" });
  await person("Lena Vogel", "Senior Product Designer", vandelay, null, { priority: 35, priorityReason: "works at Vandelay AI (open job there)" });
  await person("Mira Chen", "General Partner", null, "Example Ventures", { priority: 35, priorityReason: "investor" });
  await person("Jonas Weber", "Founder & CEO", null, "Bluth Analytics", { priority: 45, priorityReason: "founder / CEO · AI" });
  const acts = [
    { contactId: dana.id, kind: "sent", at: daysAgo(4), text: "Asked about the founding PM role and whether she'd refer me." },
    { contactId: dana.id, kind: "reply", at: daysAgo(3), text: "Happy to refer; wants to catch up first." },
    { contactId: priya.id, kind: "sent", at: daysAgo(5), text: "Sent my CV for the growth role." },
    { contactId: tom.id, kind: "intro", at: daysAgo(12), text: "Introduced me to the hiring manager." },
    { contactId: tom.id, kind: "call", at: daysAgo(2), text: "Coffee: talked about the fleet app roadmap." },
  ];
  await prisma.contactActivity.createMany({ data: acts.map((a) => ({ ...a, userId: uid, channel: "linkedin" })) });

  // LinkedIn: one post out with results, the next one drafted for its slot.
  await prisma.linkedinPost.create({
    data: {
      userId: uid, status: "posted", postedAt: daysAgo(5, 8), topic: "What 15 design partners taught me about onboarding",
      pillar: "Your field from the customer side: what makes people adopt or drop a product", impressions: 3400, reactions: 61, comments: 14,
      body: "We asked 15 customers to use our new reports for a month before launch.\n\nThe feature was fine. The onboarding wasn't: half of them never found the schedule button.\n\nWe moved it, wrote one email, and weekly active accounts grew 18% in two quarters.\n\nWhat's the smallest change that moved your numbers?",
    },
  });
  await prisma.linkedinPost.create({
    data: {
      userId: uid, status: "draft", scheduledFor: nextWeekday(2, 8, 30), topic: "Why our AI feature has a human review step",
      pillar: "Building with AI: what worked, what didn't, and what you'd do again",
      body: "Our AI summaries go out only after a person reads them.\n\nIt felt slow at first. Then we looked at the 300 reports in our evaluation set: one in twelve had a number that read right and wasn't.\n\nThe review step costs a minute. Losing a customer's trust costs a renewal.\n\nWhere do you keep a human in the loop?",
    },
  });

  // A morning scan log, so Today shows when the scan last ran.
  const logDir = path.join(process.cwd(), "personal", "web-finds");
  mkdirSync(logDir, { recursive: true });
  writeFileSync(path.join(logDir, `${now.toISOString().slice(0, 10)}.log`), "[demo] scan done\n");

  // PDFs when Chrome is available.
  const jobCvs = jobs.filter((j) => j.tailored).map((j) => `jobs/Sam_Rivera_${j.company.label.replace(/\W+/g, "_")}.html`);
  for (const rel of ["generic/product-manager.html", "generic/ai-product-manager.html", ...jobCvs]) {
    try {
      await renderHtmlToPdf(cvPath(rel)!);
    } catch {
      console.log("No Chrome: skipped PDFs.");
      break;
    }
  }
  console.log(`Demo ready: sign in as ${email} with DEMO_PASSWORD from .env.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
