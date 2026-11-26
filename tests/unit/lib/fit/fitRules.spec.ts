import { describe, expect, it } from "vitest";
import { fitFlags } from "@/lib/fit/fitRules";

const base = { location: "", workplace: "hybrid", size: "", title: "Head of Product", big: false, juniorCs: false };

describe("fitFlags", () => {
  it("is quiet for a Tel Aviv office", () => {
    expect(fitFlags({ ...base, location: "Tel Aviv-Yafo, Tel Aviv District, Israel" })).toEqual({ reasons: [], hard: false });
  });
  it("asks to check the address when only the district is given", () => {
    const f = fitFlags({ ...base, location: "Tel Aviv District, Israel" });
    expect(f.reasons[0]).toContain("check the office address");
    expect(f.hard).toBe(false);
  });
  it("flags a neighbouring city softly and a far one hard", () => {
    expect(fitFlags({ ...base, location: "Ramat Gan, Israel" }).hard).toBe(false);
    expect(fitFlags({ ...base, location: "Rosh HaAyin, Israel" })).toMatchObject({ hard: true });
  });
  it("ignores the office for remote roles", () => {
    expect(fitFlags({ ...base, location: "Rome, Italy", workplace: "remote" }).reasons).toEqual([]);
  });
  it("flags big companies and junior CS roles as hard", () => {
    expect(fitFlags({ ...base, big: true, size: "5001-10000" }).hard).toBe(true);
    expect(fitFlags({ ...base, juniorCs: true }).reasons).toContain("Customer Success below VP/Head.");
  });
});
