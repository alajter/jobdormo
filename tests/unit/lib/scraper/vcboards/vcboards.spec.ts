import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTeam8Listing, parseTeam8Detail } from "@/lib/scraper/vcboards/team8";
import { parseGetroSearch, isBigCompany, describeGetroJob } from "@/lib/scraper/vcboards/getro";
import { searchVcBoardsJobs, titleMatches, isExcludedCompany } from "@/lib/scraper/vcboards";
import { VC_BOARDS, VC_BOARD_TOKENS } from "@/lib/scraper/vcboards/boards";
import seed from "@/lib/scraper/vcboards/companies.json";
import { ATS_PROVIDERS } from "@/lib/scraper/ats/registry";
import { ATS_BOARDS } from "@/models/automation.model";
import { CreateAutomationSchema, VcBoardsSourceConfigSchema } from "@/models/automation.schema";
import { parseAtsConfig } from "@/lib/scraper/automation-run/config";

// Trimmed from team8.vc/career/ (Nov 2026).
const TEAM8_LISTING = `
<div class="inner-row w-full rounded-16 flex align-center text-20-12 font-300">
  <div class="column"><div class="position-title">Team8 Stealth Cyber Startup &#8211; Founding Product Lead</div></div>
  <div class="column"><div class="project opacity-04">Team8</div></div>
  <div class="column place"><div class="place-title">Tel Aviv, Israel</div></div>
  <div class="column arrow"><a class="arrow-link" href="https://team8.vc/career/team8/team8-stealth-cyber-startup-founding-product-lead/"><svg></svg></a></div>
</div>
<div class="inner-row w-full rounded-16 flex align-center text-20-12 font-300">
  <div class="column"><div class="position-title">AI Product Lead</div></div>
  <div class="column"><div class="project opacity-04">Fig Security</div></div>
  <div class="column place"><div class="place-title">Tel Aviv, Israel</div></div>
  <div class="column arrow"><a class="arrow-link" href="https://team8.vc/career/fig-security/ai-product-lead/"><svg></svg></a></div>
</div>`;

const TEAM8_DETAIL = `<html><header>menu</header><main><h2>Description</h2>
<p>We are looking for an exceptional Founding Product Lead.</p><ul><li>Own the product vision</li></ul>
<p>Requirements:</p><p>5+ years of product management</p><a>Apply for this position</a><form>x</form></main></html>`;

const getroPage = (found: unknown[]) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { initialState: { jobs: { found, total: found.length } } } },
  })}</script></html>`;

const GETRO_FOUND = [
  { id: 1, title: "Head of Product", url: "https://www.comeet.com/jobs/acme/1", locations: ["Tel Aviv-Yafo, Israel"], workMode: "hybrid", seniority: "senior", createdAt: 1795091516,
    organization: { name: "Acme Security", stage: "series_a", headCount: 2, industryTags: ["Cyber Security"] } },
  { id: 2, title: "VP Product", url: "https://boards.example/big", locations: ["Israel"], organization: { name: "Bigco", stage: "series_e", headCount: 6 } },
  { id: 3, title: "Senior Data Engineer", url: "https://x/3", locations: ["Israel"], organization: { name: "Acme Security", stage: "seed", headCount: 1 } },
];

describe("Team8 parser", () => {
  it("parses listing rows and names stealth companies", () => {
    const rows = parseTeam8Listing(TEAM8_LISTING);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      title: "Team8 Stealth Cyber Startup – Founding Product Lead",
      company: "Team8 (stealth startup)",
      location: "Tel Aviv, Israel",
      url: "https://team8.vc/career/team8/team8-stealth-cyber-startup-founding-product-lead/",
    });
    expect(rows[1].company).toBe("Fig Security");
  });

  it("extracts the description up to the apply link", () => {
    const html = parseTeam8Detail(TEAM8_DETAIL);
    expect(html).toContain("<p>We are looking for an exceptional Founding Product Lead.</p>");
    expect(html).toContain("<p>5+ years of product management</p>");
    expect(html).not.toContain("menu");
    expect(html).not.toContain("Apply");
    expect(parseTeam8Detail("<p>nothing here</p>")).toBe("");
  });
});

describe("Getro parser and size filter", () => {
  it("parses embedded search results", () => {
    const jobs = parseGetroSearch(getroPage(GETRO_FOUND));
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ title: "Head of Product", company: "Acme Security", stage: "series_a", headCount: 2 });
    expect(parseGetroSearch("<html>no data</html>")).toEqual([]);
  });

  it("treats late-stage or 500+ headcount companies as big", () => {
    expect(isBigCompany({ stage: "series_e" })).toBe(true);
    expect(isBigCompany({ stage: "series_a", headCount: 6 })).toBe(true);
    expect(isBigCompany({ stage: "series_b", headCount: 3 })).toBe(false);
    expect(isBigCompany({})).toBe(false);
  });

  it("describes a job from its structured fields", () => {
    const [job] = parseGetroSearch(getroPage(GETRO_FOUND));
    const d = describeGetroJob(job, "TLV Partners portfolio");
    expect(d).toContain("Head of Product at Acme Security");
    expect(d).toContain("Company stage: series a");
    expect(d).toContain("TLV Partners portfolio");
  });
});

describe("filters", () => {
  it("prefilters titles on shared words", () => {
    expect(titleMatches("Founding Product Lead", ["Founding Product Lead"])).toBe(true);
    expect(titleMatches("VP of Customer Success", ["VP Customer Success"])).toBe(true);
    expect(titleMatches("Senior Data Engineer", ["Head of Product"])).toBe(false);
    expect(titleMatches("anything", [])).toBe(true);
  });

  it("excludes companies by name prefix, case-insensitively", () => {
    expect(isExcludedCompany("Wiz, Inc.", ["Wiz"])).toBe(true);
    expect(isExcludedCompany("wizdom labs", ["Wiz"])).toBe(true);
    expect(isExcludedCompany("Acme", ["Wiz"])).toBe(false);
  });
});

describe("searchVcBoardsJobs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches Team8 details only for matching titles and drops big Getro companies", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1000 });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push(url);
      expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Jobdormo (self-hosted job tracker)");
      const body = url.endsWith("/career/") ? TEAM8_LISTING : url.includes("team8.vc/career/") ? TEAM8_DETAIL : getroPage(GETRO_FOUND);
      return new Response(body, { status: 200 });
    }));
    const { jobs, errors } = await searchVcBoardsJobs(
      [{ name: "Team8", token: "team8" }, { name: "TLV", token: "tlv-partners" }, { name: "Nope", token: "evil-host" }],
      { targetTitles: ["Founding Product Lead", "Head of Product"] },
    );
    // Senior Data Engineer shares no title words; VP Product at Bigco is series E.
    vi.useRealTimers();
    expect(errors).toEqual([{ token: "evil-host", reason: "is not a supported board" }]);
    // Team8: the listing plus detail pages for the two matching titles only.
    expect(calls.filter((u) => u.includes("team8.vc"))).toEqual([
      "https://team8.vc/career/",
      "https://team8.vc/career/team8/team8-stealth-cyber-startup-founding-product-lead/",
      "https://team8.vc/career/fig-security/ai-product-lead/",
    ]);
    // Getro: one search per target title, on the allowlisted host only.
    expect(calls.filter((u) => u.includes("tlv.partners"))).toEqual([
      "https://jobs.tlv.partners/jobs?q=Founding+Product+Lead&filter=eyJzZWFyY2hhYmxlX2xvY2F0aW9ucyI6WyJJc3JhZWwiXX0%3D",
      "https://jobs.tlv.partners/jobs?q=Head+of+Product&filter=eyJzZWFyY2hhYmxlX2xvY2F0aW9ucyI6WyJJc3JhZWwiXX0%3D",
    ]);
    expect(jobs.map((j) => `${j.title} @ ${j.company}`)).toEqual([
      "Team8 Stealth Cyber Startup – Founding Product Lead @ Team8 (stealth startup)",
      "AI Product Lead @ Fig Security",
      "Head of Product @ Acme Security",
    ]);
    expect(jobs[0].description).toContain("exceptional Founding Product Lead");
  }, 20_000);

  it("isolates a failing board", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { jobs, errors } = await searchVcBoardsJobs([{ name: "Hetz", token: "hetz" }], { targetTitles: ["VP Product"] });
    expect(jobs).toEqual([]);
    expect(errors).toEqual([{ token: "hetz", reason: "returned 503" }]);
  });
});

describe("wiring", () => {
  it("is a registered board with a matching seed", () => {
    expect(ATS_BOARDS).toContain("vcboards");
    expect(ATS_PROVIDERS.vcboards?.label).toBe("VC boards");
    expect(seed.map((s) => s.token).sort()).toEqual([...VC_BOARD_TOKENS].sort());
    for (const s of seed) expect(VC_BOARDS[s.token].name).toBe(s.name);
  });

  it("rejects board tokens outside the allowlist", () => {
    expect(VcBoardsSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "evil-host" }] }).success).toBe(false);
    const ok = CreateAutomationSchema.safeParse({
      name: "VC", jobBoard: "vcboards", resumeId: "4b5cf2c4-6f3a-4c59-9b1e-2d6a4f1f2a11", matchThreshold: 60, scheduleHour: 7,
      sourceConfig: { vcboards: { companies: [{ name: "Team8", token: "team8" }], excludeCompanies: ["Wiz"] } },
    });
    expect(ok.success).toBe(true);
  });

  it("parses excludeCompanies into the run config", () => {
    const cfg = parseAtsConfig(JSON.stringify({ vcboards: { companies: [{ name: "Team8", token: "team8" }], excludeCompanies: ["Wiz"] } }), "vcboards");
    expect(cfg?.excludeCompanies).toEqual(["Wiz"]);
    expect(parseAtsConfig(JSON.stringify({ greenhouse: { companies: [] } }), "greenhouse")?.excludeCompanies).toEqual([]);
  });
});

describe("collapseSameRole", () => {
  it("keeps one job per title+company, preferring the company's own posting", async () => {
    const { collapseSameRole } = await import("@/lib/scraper/vcboards");
    const base = { title: "Senior Technical Product Manager", company: "Classiq", description: "" };
    const out = collapseSameRole([
      { ...base, location: "Israel", url: "https://il.linkedin.com/jobs/view/1" },
      { ...base, location: "Tel Aviv District, Israel", url: "https://www.comeet.com/jobs/classiq/x" },
      { ...base, location: "Tel Aviv", url: "https://il.linkedin.com/jobs/view/2" },
      { ...base, title: "Product Manager", location: "Israel", url: "https://il.linkedin.com/jobs/view/3" },
    ] as any);
    expect(out).toHaveLength(2);
    expect(out.find((j) => j.title.startsWith("Senior"))!.url).toContain("comeet.com");
  });
});
