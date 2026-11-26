import { describe, expect, it } from "vitest";
import { fitFlags } from "@/lib/fit/fitRules";
import { DEFAULT_SEARCH_RULES, normalizeSearchRules } from "@/models/searchRules.model";

const rules = normalizeSearchRules({ homeCity: "Tel Aviv", nearbyCities: ["Ramat Gan"], maxCompanySize: 1000, seniorOnlyRoles: ["customer success"] });
const base = { location: "", workplace: "hybrid", size: "", title: "Head of Product" };

describe("fitFlags", () => {
  it("is quiet when the user has no rules", () => {
    expect(fitFlags({ ...base, location: "Rosh HaAyin, Israel", size: "10001+" }, DEFAULT_SEARCH_RULES)).toEqual({ reasons: [], hard: false });
  });
  it("is quiet for an office in the home city", () => {
    expect(fitFlags({ ...base, location: "Tel Aviv-Yafo, Tel Aviv District, Israel" }, rules)).toEqual({ reasons: [], hard: false });
  });
  it("asks to check the address when only the district is given", () => {
    const f = fitFlags({ ...base, location: "Tel Aviv District, Israel" }, rules);
    expect(f.reasons[0]).toContain("check the office address");
    expect(f.hard).toBe(false);
  });
  it("flags a nearby city softly and a far one hard", () => {
    expect(fitFlags({ ...base, location: "Ramat Gan, Israel" }, rules).hard).toBe(false);
    expect(fitFlags({ ...base, location: "Rosh HaAyin, Israel" }, rules)).toMatchObject({ hard: true });
  });
  it("ignores the office for remote roles", () => {
    expect(fitFlags({ ...base, location: "Rome, Italy", workplace: "remote" }, rules).reasons).toEqual([]);
  });
  it("flags size and seniority as hard", () => {
    expect(fitFlags({ ...base, size: "5001-10000" }, rules).hard).toBe(true);
    expect(fitFlags({ ...base, title: "Customer Success Manager" }, rules).reasons).toContain("Below the level you take this kind of role at.");
  });
});
