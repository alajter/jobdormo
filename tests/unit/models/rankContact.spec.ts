import { describe, expect, it } from "vitest";
import { rankContact } from "@/models/people.model";

const none = new Set<string>();
describe("rankContact titles", () => {
  it("doesn't take engineers and partner managers for investors", () => {
    expect(rankContact("Principal Solutions Engineer", "Globex", none).reason).not.toContain("investor");
    expect(rankContact("Partner Manager", "Acme", none).reason).not.toContain("investor");
    expect(rankContact("General Partner", "Example Capital", none).reason).toContain("investor");
    expect(rankContact("Principal", "Aleph", none).reason).toContain("investor");
  });
  it("calls a CTO a CTO, and a talent partner VC / talent", () => {
    expect(rankContact("Field CTO", "Globex", none).reason).toBe("CTO");
    expect(rankContact("Talent Partner", "Team8", none).reason).toContain("VC / talent");
  });
  it("adds a lot for a company you're pursuing", () => {
    expect(rankContact("Head of Solutions Engineers", "OX Security", new Set(["ox"])).reason).toContain("works at OX Security");
  });
});
