import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchComeetBoardJobs,
  mapComeetPosition,
  parseComeetPage,
  searchComeetJobs,
} from "@/lib/scraper/comeet";
import { parseTeamtailorRss, searchTeamtailorJobs } from "@/lib/scraper/teamtailor";
import { mapWorkableJob, searchWorkableJobs } from "@/lib/scraper/workable";
import {
  extractComeetToken,
  extractTeamtailorToken,
  extractWorkableToken,
} from "@/lib/scraper/ats/boardTokens";
import { mapWorkplace, titleMatchesAny } from "@/lib/scraper/ats/boardFetch";
import { ATS_PROVIDERS } from "@/lib/scraper/ats/registry";
import { ATS_BOARDS } from "@/models/automation.model";
import {
  ComeetSourceConfigSchema,
  CreateAutomationSchema,
  TeamtailorSourceConfigSchema,
  WorkableSourceConfigSchema,
} from "@/models/automation.schema";
import { companyBoardUrl } from "@/lib/atsBoardUrl";
import { ATS_TOKEN_REGEX } from "@/lib/scraper/utils";
import { COMEET_TOKEN_REGEX } from "@/lib/scraper/comeet/token";
import comeetSeed from "@/lib/scraper/comeet/companies.json";
import teamtailorSeed from "@/lib/scraper/teamtailor/companies.json";
import workableSeed from "@/lib/scraper/workable/companies.json";

const UA = "Jobdormo (self-hosted job tracker)";

// Trimmed from www.comeet.com/jobs/Claroty/F2.004 (Nov 2026).
const COMEET_POSITION = {
  name: "Backend Software Engineer",
  department: "Software Engineering",
  location: { name: "Israel", country: "IL", city: "Tel Aviv", is_remote: true },
  url_comeet_hosted_page: "https://www.comeet.com/jobs/Claroty/F2.004/backend-software-engineer/0A.374",
  url_active_page: "https://claroty.com/open-positions/0A.374#hop",
  employment_type: "Full Time Employee",
  uid: "0A.374",
  custom_fields: {
    details: [
      { name: "Requirements", value: "<ul><li>5+ years</li></ul>", order: 3 },
      { name: "Description", value: "<p>Build the platform</p>", order: 1 },
      { name: "Empty", value: "", order: 2 },
    ],
  },
  time_updated: "2026-11-23T15:39:44Z",
  company_name: "Claroty",
  workplace_type: "Hybrid",
};

const comeetPage = (positions: unknown[]) => `<html><script>
       var COMPANY_DATA ;
       var COMPANY_POSITIONS_DATA ;
       COMPANY_DATA = {"name": "Claroty", "location": "Israel"};
       COMPANY_POSITIONS_DATA = ${JSON.stringify(positions)};
       POSITION_DATA = null;
</script></html>`;

// Trimmed from dreeze.teamtailor.com/jobs.rss (Nov 2026).
const TEAMTAILOR_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:tt="https://teamtailor.com/locations">
  <channel>
    <title>Dreeze</title>
    <item>
      <title>Product Manager &amp; Owner</title>
      <description>&lt;p&gt;Own the &lt;strong&gt;core&lt;/strong&gt; domain&lt;/p&gt;</description>
      <pubDate>Mon, 12 Oct 2026 18:49:26 +0300</pubDate>
      <link>https://careers.dreeze.com/jobs/8533824-product-manager</link>
      <remoteStatus>hybrid</remoteStatus>
      <guid>b39a8475</guid>
      <tt:locations>
        <tt:location>
          <tt:name>Tel Aviv</tt:name>
          <tt:city>Tel Aviv-Yafo</tt:city>
          <tt:country>Israel</tt:country>
        </tt:location>
      </tt:locations>
    </item>
    <item>
      <title>Solutions Engineer</title>
      <description>&lt;p&gt;Remote role&lt;/p&gt;</description>
      <pubDate>Tue, 13 Oct 2026 10:00:00 +0000</pubDate>
      <link>https://careers.dreeze.com/jobs/2-solutions-engineer</link>
      <remoteStatus>fully</remoteStatus>
      <tt:locations></tt:locations>
    </item>
  </channel>
</rss>`;

const WORKABLE_ACCOUNT = {
  name: "Acme",
  jobs: [
    {
      title: "Senior Backend Engineer",
      shortcode: "81B46579FE",
      employment_type: "Full-time",
      telecommuting: false,
      url: "https://apply.workable.com/j/81B46579FE",
      published_on: "2026-11-01",
      country: "Israel",
      city: "Tel Aviv",
      locations: [{ country: "Israel", countryCode: "IL", city: "Tel Aviv", hidden: false }],
      description: "<p>Build things</p>",
    },
    {
      title: "Solutions Engineer",
      telecommuting: true,
      url: "https://apply.workable.com/j/2",
      country: "Germany",
      city: "",
      locations: [],
      description: "<p>Remote</p>",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Comeet", () => {
  it("parses the embedded positions and company name", () => {
    const parsed = parseComeetPage(comeetPage([COMEET_POSITION]));
    expect(parsed?.companyName).toBe("Claroty");
    expect(parsed?.positions).toHaveLength(1);
    expect(parseComeetPage("<html>no data</html>")).toBeNull();
  });

  it("maps a position: city + location, ordered details, workplace", () => {
    const job = mapComeetPosition(COMEET_POSITION, "Claroty");
    expect(job).toMatchObject({
      title: "Backend Software Engineer",
      company: "Claroty",
      location: "Tel Aviv, Israel",
      url: "https://www.comeet.com/jobs/Claroty/F2.004/backend-software-engineer/0A.374",
      postedDate: "2026-11-23T15:39:44Z",
      employmentType: "Full Time Employee",
      workplaceType: "HYBRID",
    });
    expect(job.description).toBe(
      "<h3>Description</h3><p>Build the platform</p>\n<h3>Requirements</h3><ul><li>5+ years</li></ul>",
    );
  });

  it("fetches the hosted page with the honest UA", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["User-Agent"]).toBe(UA);
      const res = new Response(comeetPage([COMEET_POSITION]), { status: 200 });
      Object.defineProperty(res, "url", { value: url });
      return res;
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchComeetBoardJobs("Claroty", "Claroty/F2.004");
    expect(fetchMock).toHaveBeenCalledWith("https://www.comeet.com/jobs/Claroty/F2.004", expect.anything());
    expect(result.success && result.data.map((j) => j.title)).toEqual(["Backend Software Engineer"]);
  });

  it("treats a redirect to the home page as an unknown board, isolating it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const ok = url.includes("Claroty");
        const res = new Response(ok ? comeetPage([COMEET_POSITION]) : "<html>home</html>", { status: 200 });
        Object.defineProperty(res, "url", { value: ok ? url : "https://www.comeet.com/" });
        return res;
      }),
    );
    const { jobs, errors } = await searchComeetJobs([
      { name: "Claroty", token: "Claroty/F2.004" },
      { name: "Nope", token: "nope/AA.000" },
      { name: "Evil", token: "../../etc" },
    ]);
    expect(jobs).toHaveLength(1);
    expect(errors).toEqual([
      { token: "nope/AA.000", reason: "No Comeet board found for 'nope/AA.000'" },
      { token: "../../etc", reason: "Invalid Comeet token '../../etc'" },
    ]);
  });
});

describe("Teamtailor", () => {
  it("parses the RSS feed: decoded title/description, locations, remote status", () => {
    const jobs = parseTeamtailorRss(TEAMTAILOR_RSS, "Dreeze");
    expect(jobs).toEqual([
      {
        title: "Product Manager & Owner",
        company: "Dreeze",
        location: "Tel Aviv-Yafo, Israel",
        description: "<p>Own the <strong>core</strong> domain</p>",
        url: "https://careers.dreeze.com/jobs/8533824-product-manager",
        postedDate: "2026-10-12T15:49:26.000Z",
        workplaceType: "HYBRID",
      },
      expect.objectContaining({ title: "Solutions Engineer", location: "Remote", workplaceType: "REMOTE" }),
    ]);
  });

  it("only ever fetches {slug}.teamtailor.com and isolates a 404", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.startsWith("https://dreeze.")
          ? new Response(TEAMTAILOR_RSS, { status: 200 })
          : new Response("", { status: 404 });
      }),
    );
    const { jobs, errors } = await searchTeamtailorJobs([
      { name: "Dreeze", token: "dreeze" },
      { name: "Gone", token: "gone" },
    ]);
    expect(calls).toEqual(["https://dreeze.teamtailor.com/jobs.rss", "https://gone.teamtailor.com/jobs.rss"]);
    expect(jobs).toHaveLength(2);
    expect(errors).toEqual([{ token: "gone", reason: "No Teamtailor site found for 'gone'" }]);
  });
});

describe("Workable", () => {
  it("maps jobs: locations, remote flag, posted date", () => {
    const [onsite, remote] = WORKABLE_ACCOUNT.jobs.map((j) => mapWorkableJob(j, "Acme"));
    expect(onsite).toMatchObject({
      title: "Senior Backend Engineer",
      location: "Tel Aviv, Israel",
      url: "https://apply.workable.com/j/81B46579FE",
      postedDate: "2026-11-01",
      employmentType: "Full-time",
      workplaceType: undefined,
    });
    expect(remote).toMatchObject({ location: "Remote (Germany)", workplaceType: "REMOTE" });
  });

  it("fetches the widget API with details and isolates failures", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("/acme")) return new Response(JSON.stringify(WORKABLE_ACCOUNT), { status: 200 });
        if (url.includes("/busy")) return new Response("", { status: 429 });
        return new Response("Not Found", { status: 404 });
      }),
    );
    const { jobs, errors } = await searchWorkableJobs([
      { name: "Acme", token: "acme" },
      { name: "Busy", token: "busy" },
      { name: "Gone", token: "gone" },
    ]);
    expect(calls[0]).toBe("https://apply.workable.com/api/v1/widget/accounts/acme?details=true");
    expect(jobs).toHaveLength(2);
    expect(errors).toEqual([
      { token: "busy", reason: "rate limited" },
      { token: "gone", reason: "No Workable account found for 'gone'" },
    ]);
  });
});

describe("token extraction", () => {
  it("Comeet: link or slug/uid", () => {
    expect(extractComeetToken("https://www.comeet.com/jobs/Claroty/F2.004/backend/0A.374")).toBe("Claroty/F2.004");
    expect(extractComeetToken("cynet/33.00D")).toBe("cynet/33.00D");
    expect(extractComeetToken("https://evil.com/x")).toBeNull();
    expect(extractComeetToken("claroty")).toBeNull();
  });

  it("Teamtailor: subdomain, custom domain or slug", () => {
    expect(extractTeamtailorToken("https://dreeze.teamtailor.com/jobs")).toBe("dreeze");
    expect(extractTeamtailorToken("https://careers.dreeze.com/jobs")).toBe("dreeze");
    expect(extractTeamtailorToken("Dreeze")).toBe("dreeze");
    expect(extractTeamtailorToken("a/../b")).toBeNull();
  });

  it("Workable: apply link, subdomain or slug", () => {
    expect(extractWorkableToken("https://apply.workable.com/huggingface/")).toBe("huggingface");
    expect(extractWorkableToken("https://apply.workable.com/huggingface/j/81B46579FE")).toBe("huggingface");
    expect(extractWorkableToken("https://acme.workable.com")).toBe("acme");
    expect(extractWorkableToken("acme")).toBe("acme");
    expect(extractWorkableToken("https://apply.workable.com/j/81B46579FE")).toBeNull();
  });
});

describe("helpers", () => {
  it("maps workplace strings", () => {
    expect(mapWorkplace("On-site")).toBe("ONSITE");
    expect(mapWorkplace("fully")).toBe("REMOTE");
    expect(mapWorkplace("hybrid")).toBe("HYBRID");
    expect(mapWorkplace("temporary")).toBeUndefined();
  });

  it("matches titles on shared words", () => {
    expect(titleMatchesAny("Senior Product Manager", ["Product Manager"])).toBe(true);
    expect(titleMatchesAny("Backend Engineer", ["Product Manager"])).toBe(false);
    expect(titleMatchesAny("Anything", [])).toBe(true);
  });
});

describe("wiring", () => {
  it("registers the three boards", () => {
    for (const id of ["comeet", "teamtailor", "workable"] as const) {
      expect(ATS_BOARDS).toContain(id);
      expect(ATS_PROVIDERS[id]?.id).toBe(id);
    }
  });

  it("seed tokens are valid and unique", () => {
    for (const [seed, re] of [
      [comeetSeed, COMEET_TOKEN_REGEX],
      [teamtailorSeed, ATS_TOKEN_REGEX],
      [workableSeed, ATS_TOKEN_REGEX],
    ] as const) {
      const tokens = (seed as { name: string; token: string }[]).map((s) => s.token);
      for (const t of tokens) expect(t).toMatch(re);
      expect(new Set(tokens.map((t) => t.toLowerCase())).size).toBe(tokens.length);
    }
    expect((teamtailorSeed as { token: string }[]).some((s) => s.token === "dreeze")).toBe(true);
  });

  it("schemas reject malformed tokens and accept good ones", () => {
    expect(ComeetSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "x/../AA.000" }] }).success).toBe(false);
    expect(ComeetSourceConfigSchema.safeParse({ companies: [{ name: "Claroty", token: "Claroty/F2.004" }] }).success).toBe(true);
    expect(TeamtailorSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "evil.com/x" }] }).success).toBe(false);
    expect(WorkableSourceConfigSchema.safeParse({ companies: [{ name: "x", token: "a?b" }] }).success).toBe(false);
    const ok = CreateAutomationSchema.safeParse({
      name: "Comeet", jobBoard: "comeet", resumeId: "4b5cf2c4-6f3a-4c59-9b1e-2d6a4f1f2a11", matchThreshold: 60, scheduleHour: 7,
      sourceConfig: { comeet: { companies: [{ name: "Claroty", token: "Claroty/F2.004" }], requireTerms: ["security"] } },
    });
    expect(ok.success).toBe(true);
  });

  it("builds public board URLs", () => {
    expect(companyBoardUrl("comeet", { token: "Claroty/F2.004" })).toBe("https://www.comeet.com/jobs/Claroty/F2.004");
    expect(companyBoardUrl("teamtailor", { token: "dreeze" })).toBe("https://dreeze.teamtailor.com/jobs");
    expect(companyBoardUrl("workable", { token: "acme" })).toBe("https://apply.workable.com/acme");
  });
});
