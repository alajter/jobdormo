import { describe, expect, it } from "vitest";
import { cvOf, outcomeOf, routeOf, summarizeResults, type AppRow } from "@/lib/results";

const now = new Date("2026-11-26T12:00:00Z");
const d = (s: string) => new Date(`${s}T10:00:00Z`);
let i = 0;
const app = (o: Partial<AppRow>): AppRow => ({
  id: `a${++i}`, company: `Co${i}`, title: "PM", status: "applied", appliedAt: d("2026-11-20"),
  outreach: null, source: "LinkedIn", hasTailored: false, tailoredAts: null, stages: [], ...o,
});
const net = { sent: 0, replies: 0, intros: 0, calls: 0 };
const posts = { published: 0, impressions: 0, reactions: 0, comments: 0 };

describe("classification", () => {
  it("counts an interview even when the job was rejected later", () => {
    expect(outcomeOf(app({ status: "rejected", stages: [{ status: "interview", at: null }] }))).toBe("interview");
    expect(outcomeOf(app({ status: "rejected" }))).toBe("rejected");
    expect(outcomeOf(app({ status: "applied" }))).toBe("waiting");
  });
  it("names the route and the CV", () => {
    expect(routeOf(app({ outreach: "referred" }))).toBe("Referral");
    expect(routeOf(app({}))).toBe("No reach-out logged");
    expect(cvOf(app({ sentCv: "tailored", sentAts: 80 }))).toBe("Tailored CV (75%+)");
    expect(cvOf(app({ sentCv: "tailored", sentAts: 60 }))).toBe("Tailored, below 75%");
    // A CV tailored after applying doesn't count: what matters is what went out.
    expect(cvOf(app({ sentCv: "generic", hasTailored: true, tailoredAts: 90 }))).toBe("Generic CV");
    expect(cvOf(app({}))).toBe("CV not recorded");
  });
});

describe("summarizeResults", () => {
  it("flags early rejections, silence and few interviews, and won't compare small groups", () => {
    const apps = [
      app({ status: "rejected", outreach: "referred", appliedAt: d("2026-11-21"), stages: [{ status: "rejected", at: d("2026-11-23") }] }),
      app({ status: "rejected", appliedAt: d("2026-11-21"), stages: [{ status: "rejected", at: d("2026-11-25") }] }),
      app({ status: "rejected", outreach: "sent", appliedAt: d("2026-11-22"), stages: [{ status: "rejected", at: d("2026-11-25") }] }),
      app({ status: "interview", company: "Globex", outreach: null }),
      app({ appliedAt: d("2026-11-01") }),
      app({ appliedAt: d("2026-11-02"), followUpOff: true }),
      ...Array.from({ length: 6 }, () => app({})),
    ];
    const s = summarizeResults({ apps, network: { sent: 10, replies: 4, intros: 2, calls: 0 }, posts, now });
    expect(s.total).toBe(12);
    expect(s.interviews).toBe(1);
    expect(s.rejected).toBe(3);
    expect(s.silent.map((x) => x.days)).toEqual([25]);
    const text = s.findings.map((f) => f.text).join("\n");
    expect(text).toContain("3 of 3 rejections came before any interview, about 3 days after applying");
    expect(text).toContain("One of them was a referral");
    expect(text).toContain("silent for 14+ days");
    expect(text).toContain("1 interview from 12 applications");
    expect(text).toMatch(/By route .*too few decided applications/);
    expect(text).toContain("4 of 10 messages got a reply (40%), and 2 intros");
  });

  it("says when every rejection went out with the generic CV, and waits on tailored ones", () => {
    const rej = (ats: number) =>
      app({ status: "rejected", sentCv: "generic", sentAts: ats, stages: [{ status: "rejected", at: d("2026-11-22") }] });
    const s = summarizeResults({
      apps: [rej(12), rej(40), rej(20), app({ sentCv: "tailored", sentAts: 86 }), app({ sentCv: "tailored", sentAts: 80 })],
      network: net,
      posts,
      now,
    });
    const text = s.findings.map((f) => f.text).join("\n");
    expect(text).toContain("All 3 rejections went out with the generic CV (12–40% ATS where scored)");
    expect(text).toContain("2 applications went out with a tailored CV; no answer yet");
  });

  it("compares groups once each has enough answers", () => {
    const apps = [
      ...Array.from({ length: 5 }, () => app({ outreach: "referred", status: "interview" })),
      ...Array.from({ length: 5 }, () => app({ status: "rejected" })),
    ];
    const s = summarizeResults({ apps, network: net, posts, now });
    expect(s.findings.find((f) => f.text.startsWith("Referral:"))?.text).toContain("100% of decided applications reached an interview, against 0%");
  });

  it("says there's nothing to measure with no applications", () => {
    expect(summarizeResults({ apps: [], network: net, posts, now }).findings[0].text).toMatch(/No applications yet/);
  });
});
