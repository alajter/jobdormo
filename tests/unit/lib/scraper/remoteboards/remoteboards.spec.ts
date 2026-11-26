import { afterEach, describe, expect, it, vi } from "vitest";
import {
  himalayasRegion,
  mapRemotiveJob,
  parseWwrRss,
  searchRemoteBoardsJobs,
} from "@/lib/scraper/remoteboards";
import { REMOTE_BOARDS, REMOTE_BOARD_TOKENS, isRegionOpenToUser } from "@/lib/scraper/remoteboards/boards";
import seed from "@/lib/scraper/remoteboards/companies.json";
import { passesRemoteRule } from "@/lib/scraper/ats/eligibility";
import { ATS_PROVIDERS } from "@/lib/scraper/ats/registry";
import { ATS_BOARDS } from "@/models/automation.model";
import { RemoteBoardsSourceConfigSchema } from "@/models/automation.schema";

// Trimmed from weworkremotely.com/categories/remote-product-jobs.rss (Nov 2026).
const WWR_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>We Work Remotely: Product Jobs</title>
<item>
  <title>GitLab: Professional Services, Program Manager</title>
  <region>Canada Only</region>
  <type>Full-Time</type>
  <description>&lt;p&gt;Canada role&lt;/p&gt;</description>
  <pubDate>Mon, 23 Nov 2026 17:01:48 +0000</pubDate>
  <link>https://weworkremotely.com/remote-jobs/gitlab-pm</link>
</item>
<item>
  <title>Acme: Senior Product Manager</title>
  <region>Anywhere in the World</region>
  <type>Full-Time</type>
  <description>&lt;p&gt;Lead &amp;amp; ship&lt;/p&gt;</description>
  <pubDate>Mon, 23 Nov 2026 10:00:00 +0000</pubDate>
  <link>https://weworkremotely.com/remote-jobs/acme-spm</link>
</item>
<item>
  <title>Beta: Product Manager, EU</title>
  <region>Europe Only</region>
  <description>&lt;p&gt;EU&lt;/p&gt;</description>
  <link>https://weworkremotely.com/remote-jobs/beta-pm</link>
</item>
<item>
  <title>Gamma: Product Manager</title>
  <region>USA Only</region>
  <description>x</description>
  <link>https://weworkremotely.com/remote-jobs/gamma-pm</link>
</item>
<item>
  <title>Delta: Backend Engineer</title>
  <region>Anywhere in the World</region>
  <description>x</description>
  <link>https://weworkremotely.com/remote-jobs/delta-be</link>
</item>
</channel></rss>`;

const REMOTIVE = {
  "job-count": 3,
  jobs: [
    { url: "https://remotive.com/remote-jobs/product/a-1", title: "Product Manager", company_name: "A", job_type: "full_time", publication_date: "2026-11-19T14:58:42", candidate_required_location: "USA", description: "<p>a</p>" },
    { url: "https://remotive.com/remote-jobs/product/b-2", title: "Lead Product Manager", company_name: "B", job_type: "full_time", publication_date: "2026-11-19T14:58:42", candidate_required_location: "Europe, USA, Canada", description: "<p>b</p>" },
    { url: "https://remotive.com/remote-jobs/product/c-3", title: "Product Manager", company_name: "C", candidate_required_location: "Worldwide", description: "<p>c</p>" },
  ],
};

const HIMALAYAS = {
  totalCount: 2,
  jobs: [
    { title: "Principal Product Manager", companyName: "airSlate", employmentType: "Full Time", locationRestrictions: ["Israel"], description: "<p>h1</p>", pubDate: 1795452774, applicationLink: "https://himalayas.app/companies/airslate/jobs/ppm?utm_source=api" },
    { title: "Product Manager", companyName: "Canonical", locationRestrictions: [], description: "<p>h2</p>", pubDate: 1795452774, applicationLink: "https://himalayas.app/companies/canonical/jobs/pm?utm_source=api" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("parsers", () => {
  it("splits WWR 'Company: Role' titles and keeps the region in location", () => {
    const [first, second] = parseWwrRss(WWR_RSS);
    expect(first).toMatchObject({ company: "GitLab", title: "Professional Services, Program Manager", location: "Remote (Canada Only)", region: "Canada Only", workplaceType: "REMOTE" });
    expect(second).toMatchObject({ company: "Acme", title: "Senior Product Manager", description: "<p>Lead & ship</p>", postedDate: "2026-11-23T10:00:00.000Z" });
  });

  it("maps Remotive jobs as remote with their region", () => {
    expect(mapRemotiveJob(REMOTIVE.jobs[1])).toMatchObject({ location: "Remote (Europe, USA, Canada)", workplaceType: "REMOTE", employmentType: "full-time" });
  });

  it("summarises long Himalayas country lists", () => {
    expect(himalayasRegion([])).toBe("Worldwide");
    expect(himalayasRegion(["India", "Israel"])).toBe("India, Israel");
    expect(himalayasRegion(Array.from({ length: 10 }, (_, i) => (i === 3 ? "Israel" : `C${i}`)))).toBe("Israel and 9 other countries");
  });
});

describe("region gate", () => {
  it("keeps worldwide, Europe/EMEA and Israel; drops US/UK/other-only", () => {
    for (const r of ["Anywhere in the World", "Worldwide", "Europe Only", "EMEA Only", "Israel", "LATAM, Europe, USA", "", "Remote"]) {
      expect(isRegionOpenToUser(r)).toBe(true);
    }
    for (const r of ["USA Only", "USA", "Canada Only", "UK Only", "Asia Only", "Latin America Only", "USA, Canada", "Brazil"]) {
      expect(isRegionOpenToUser(r)).toBe(false);
    }
  });

  it("US-only locations also fail the shared remote rule", () => {
    const job = { title: "PM", company: "X", location: "Remote (USA Only)", description: "", url: "u", workplaceType: "REMOTE", isRemote: true };
    expect(passesRemoteRule(job, true)).toBe(false);
    expect(passesRemoteRule({ ...job, location: "Remote (Europe Only)" }, true)).toBe(true);
  });
});

describe("searchRemoteBoardsJobs", () => {
  it("fetches allowlisted boards politely, filters by region and title, dedupes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 2000 });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(url);
        expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Jobdormo (self-hosted job tracker)");
        if (url.startsWith("https://remotive.com")) return new Response(JSON.stringify(REMOTIVE));
        if (url.startsWith("https://himalayas.app")) return new Response(JSON.stringify(HIMALAYAS));
        return new Response(WWR_RSS);
      }),
    );
    const { jobs, errors } = await searchRemoteBoardsJobs(
      [
        { name: "Remotive", token: "remotive" },
        { name: "Himalayas", token: "himalayas" },
        { name: "WWR", token: "wwr-product" },
        { name: "WWR again", token: "wwr-product" },
        { name: "Evil", token: "evil-host" },
      ],
      { targetTitles: ["Product Manager"] },
    );
    expect(errors).toEqual([{ token: "evil-host", reason: "not an allowed remote board" }]);
    expect(calls).toEqual([
      "https://remotive.com/api/remote-jobs",
      "https://himalayas.app/jobs/api/search?country=Israel&page=1&q=Product+Manager",
      "https://weworkremotely.com/categories/remote-product-jobs.rss",
      "https://weworkremotely.com/categories/remote-product-jobs.rss",
    ]);
    expect(jobs.map((j) => `${j.title} @ ${j.company} | ${j.location}`)).toEqual([
      "Lead Product Manager @ B | Remote (Europe, USA, Canada)",
      "Product Manager @ C | Remote (Worldwide)",
      "Principal Product Manager @ airSlate | Remote (Israel)",
      "Product Manager @ Canonical | Remote (Worldwide)",
      "Senior Product Manager @ Acme | Remote (Anywhere in the World)",
      "Product Manager, EU @ Beta | Remote (Europe Only)",
    ]);
    expect(jobs.every((j) => j.workplaceType === "REMOTE")).toBe(true);
  }, 30_000);

  it("isolates a failing board", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const { jobs, errors } = await searchRemoteBoardsJobs([{ name: "WWR", token: "wwr-design" }]);
    expect(jobs).toEqual([]);
    expect(errors).toEqual([{ token: "wwr-design", reason: "returned 503" }]);
  });
});

describe("wiring", () => {
  it("is a registered board with a matching seed", () => {
    expect(ATS_BOARDS).toContain("remoteboards");
    expect(ATS_PROVIDERS.remoteboards?.label).toBe("Remote boards");
    expect(seed.map((s) => s.token).sort()).toEqual([...REMOTE_BOARD_TOKENS].sort());
    for (const s of seed) expect(REMOTE_BOARDS[s.token].name).toBe(s.name);
  });

  it("rejects board tokens outside the allowlist", () => {
    expect(RemoteBoardsSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "evil-host" }] }).success).toBe(false);
    expect(RemoteBoardsSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "himalayas" }], remoteOk: true }).success).toBe(true);
  });
});
