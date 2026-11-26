import { describe, expect, it } from "vitest";
import { isRemoteRestrictedElsewhere, matchesRequiredTerms, passesRemoteRule } from "@/lib/scraper/ats/eligibility";

const job = (location: string, description = "", title = "VP Customer Success", company = "Acme") =>
  ({ title, company, location, description, url: "https://x" });

describe("remote rule", () => {
  it("drops US-only remote roles", () => {
    const token = job("New York / New Jersey (hybrid) or Remote (US)", "Open to exceptional candidates elsewhere in the US.");
    expect(isRemoteRestrictedElsewhere(token)).toBe(true);
    expect(passesRemoteRule(token, true)).toBe(false);
    expect(passesRemoteRule(job("Remote - USA"), true)).toBe(false);
  });
  it("keeps remote roles open to Israel or EMEA", () => {
    expect(passesRemoteRule(job("Remote"), true)).toBe(true);
    expect(passesRemoteRule(job("Remote (EMEA)"), true)).toBe(true);
    expect(passesRemoteRule(job("Remote, Israel or US"), true)).toBe(true);
  });
  it("leaves non-remote jobs to the location gate", () => {
    expect(passesRemoteRule(job("Tel Aviv, Israel"), true)).toBe(true);
    expect(passesRemoteRule(job("New York"), true)).toBe(true);
  });
  it("does nothing when remote is not opted in", () => {
    expect(passesRemoteRule(job("Remote (US)"), false)).toBe(true);
  });
});

describe("required terms", () => {
  it("keeps only jobs mentioning a term", () => {
    expect(matchesRequiredTerms(job("Tel Aviv", "We build a cloud security platform"), ["cyber", "security"])).toBe(true);
    expect(matchesRequiredTerms(job("Tel Aviv", "Payments for SMBs", "VP CS", "Mesh Payments"), ["cyber", "security"])).toBe(false);
    expect(matchesRequiredTerms(job("Tel Aviv"), [])).toBe(true);
  });
});

describe("pinned remote and title rules", () => {
  const job = (location: string, title = "Product Manager") => ({ title, company: "X", location, description: "", url: "" }) as any;
  it("drops a remote role pinned to a city outside the user's region", async () => {
    const { passesRemoteRule } = await import("@/lib/scraper/ats/eligibility");
    expect(passesRemoteRule(job("Hyderabad (Remote)"), true)).toBe(false);
    expect(passesRemoteRule(job("Remote - Poland"), true)).toBe(false);
    expect(passesRemoteRule(job("Tel Aviv (Remote)"), true)).toBe(true);
    expect(passesRemoteRule(job("Remote (Israel and 201 other countries)"), true)).toBe(true);
    expect(passesRemoteRule(job("Remote (EMEA)"), true)).toBe(true);
    expect(passesRemoteRule(job("Remote"), true)).toBe(true);
  });
  it("strict titles keep target titles and drop excluded words", async () => {
    const { passesTitleRule } = await import("@/lib/scraper/ats/eligibility");
    const cfg = { strictTitles: true, targetTitles: ["Senior Product Manager", "Head of Product"], excludeTitleTerms: ["marketing"] };
    expect(passesTitleRule(job("", "Senior Product Manager, AI"), cfg)).toBe(true);
    expect(passesTitleRule(job("", "AI Engineer"), cfg)).toBe(false);
    expect(passesTitleRule(job("", "Product Marketing Manager"), cfg)).toBe(false);
    expect(passesTitleRule(job("", "AI Engineer"), { targetTitles: ["Product Manager"] })).toBe(true);
  });
});
