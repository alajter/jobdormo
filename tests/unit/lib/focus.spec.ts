import { describe, expect, it } from "vitest";
import { focusFor, isBigCompany, isJuniorCsRole, rankFocus, type FocusJob } from "@/lib/focus";

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
  it("skips big companies and junior CS roles", () => {
    expect(focusFor(job({ size: "1001-5000" })).verb).toBe("skip");
    expect(focusFor(job({ title: "Customer Success Manager" })).verb).toBe("skip");
    expect(focusFor(job({ title: "VP Customer Success" })).verb).not.toBe("skip");
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
    ]);
    expect(r.map((x) => x.id)).toEqual(["a", "t2", "t", "s"]);
  });
});

describe("helpers", () => {
  it("reads company sizes", () => {
    expect(isBigCompany("51-200")).toBe(false);
    expect(isBigCompany("1001-5000")).toBe(true);
    expect(isBigCompany(null)).toBe(false);
  });
  it("treats product roles as not CS", () => {
    expect(isJuniorCsRole("Product Manager, Customer Experience")).toBe(false);
  });
});
