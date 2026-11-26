import { describe, expect, it } from "vitest";
import { focusFor, rankFocus, type FocusJob } from "@/lib/focus";
import { normalizeSearchRules } from "@/models/searchRules.model";

const rules = normalizeSearchRules({ maxCompanySize: 1000, seniorOnlyRoles: ["customer success"] });

const now = new Date("2026-11-26T08:00:00Z");
const job = (o: Partial<FocusJob>): FocusJob => ({
  id: "j", title: "Senior Product Manager", company: "Acme", match: 70, atsBase: 30, atsTailored: null,
  hasTailored: false, highIssues: 0, now, ...o,
});

describe("focusFor", () => {
  it("says apply when the tailored CV is at the target with no must-fix issues", () => {
    expect(focusFor(job({ hasTailored: true, atsTailored: 86 }))).toMatchObject({ verb: "apply", reason: "CV ready to send" });
  });
  it("says tailor when a ready CV still has a must-fix issue", () => {
    expect(focusFor(job({ hasTailored: true, atsTailored: 80, highIssues: 2 })).verb).toBe("tailor");
  });
  it("says tailor for a good fit without a CV at the target", () => {
    expect(focusFor(job({ match: 74, atsBase: 52 }))).toMatchObject({ verb: "tailor", reason: "Good fit; no CV for it yet" });
  });
  it("skips companies over the size limit and roles below the senior level, per the user's rules", () => {
    expect(focusFor(job({ size: "1001-5000" }), rules).verb).toBe("skip");
    expect(focusFor(job({ title: "Customer Success Manager" }), rules).verb).toBe("skip");
    expect(focusFor(job({ title: "VP Customer Success" }), rules).verb).not.toBe("skip");
  });
  it("skips an office outside the home city, but not a remote role or a nearby city", () => {
    const r = normalizeSearchRules({ homeCity: "Berlin", nearbyCities: ["Potsdam"] });
    expect(focusFor(job({ location: "Munich", workplace: "ONSITE" }), r)).toMatchObject({ verb: "skip", reason: "Office in Munich, outside Berlin" });
    expect(focusFor(job({ location: "Munich", workplace: "REMOTE" }), r).verb).not.toBe("skip");
    expect(focusFor(job({ location: "Potsdam", workplace: "HYBRID" }), r).verb).not.toBe("skip");
  });
  it("has no size or seniority rule until the user sets one", () => {
    expect(focusFor(job({ size: "10001+" })).verb).not.toBe("skip");
    expect(focusFor(job({ title: "Customer Success Manager" })).verb).not.toBe("skip");
  });
  it("skips stale and weak-fit scan finds, but never a job added by hand", () => {
    expect(focusFor(job({ postedAt: "2025-08-22" })).verb).toBe("skip");
    expect(focusFor(job({ match: 40 })).verb).toBe("skip");
    expect(focusFor(job({ match: 48, postedAt: "2025-08-22", addedByYou: true })).verb).toBe("look");
  });
  it("puts jobs with a live conversation under follow up", () => {
    expect(focusFor(job({ outreachStatus: "referred", match: 55 })).verb).toBe("talk");
  });
  it("ranks apply before tailor before skip, higher match first", () => {
    const r = rankFocus([
      job({ id: "s", size: "10001+" }),
      job({ id: "t", match: 62 }),
      job({ id: "a", hasTailored: true, atsTailored: 77, match: 60 }),
      job({ id: "t2", match: 74 }),
    ], rules);
    expect(r.map((x) => x.id)).toEqual(["a", "t2", "t", "s"]);
  });
});
