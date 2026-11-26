import { describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_RULES, isBelowSeniority, isTooBig, locationCheck, minHeadcount, normalizeSearchRules } from "@/models/searchRules.model";

const rules = normalizeSearchRules({
  homeCity: "Tel Aviv",
  nearbyCities: "Ramat Gan, Herzliya",
  maxCompanySize: 1000,
  seniorOnlyRoles: ["customer success", "support"],
});

describe("search rules", () => {
  it("has no location, size or seniority rule by default", () => {
    expect(locationCheck("Rosh HaAyin, Israel", "onsite", DEFAULT_SEARCH_RULES)).toBeNull();
    expect(isTooBig("10001+", DEFAULT_SEARCH_RULES)).toBe(false);
    expect(isBelowSeniority("Customer Success Manager", DEFAULT_SEARCH_RULES)).toBe(false);
  });
  it("reads company sizes", () => {
    expect(minHeadcount("1,001-5,000")).toBe(1001);
    expect(minHeadcount("10001+")).toBe(10001);
    expect(isTooBig("1001-5000", rules)).toBe(true);
    expect(isTooBig("201-500", rules)).toBe(false);
    expect(isTooBig(null, rules)).toBe(false);
  });
  it("checks the office against the home city", () => {
    expect(locationCheck("Tel Aviv-Yafo, Tel Aviv District, Israel", "hybrid", rules)).toBeNull();
    expect(locationCheck("Tel Aviv District, Israel", "hybrid", rules)).toMatchObject({ hard: false });
    expect(locationCheck("Ramat Gan, Israel", "onsite", rules)).toMatchObject({ hard: false, reason: expect.stringContaining("check the commute") });
    expect(locationCheck("Rosh HaAyin, Israel", "onsite", rules)).toMatchObject({ hard: true });
    expect(locationCheck("Rome, Italy", "remote", rules)).toBeNull();
  });
  it("takes some roles only at a senior level", () => {
    expect(isBelowSeniority("Customer Success Manager", rules)).toBe(true);
    expect(isBelowSeniority("VP Customer Success", rules)).toBe(false);
    expect(isBelowSeniority("Head of Support", rules)).toBe(false);
    expect(isBelowSeniority("Senior Product Manager", rules)).toBe(false);
  });
  it("clamps and cleans what the form sends", () => {
    const r = normalizeSearchRules({ atsTarget: 500, minMatch: -3, staleDays: "x", nearbyCities: " A , ,B " });
    expect(r).toMatchObject({ atsTarget: 100, minMatch: 0, staleDays: 60, nearbyCities: ["A", "B"] });
  });
});
