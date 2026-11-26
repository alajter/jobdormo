import { describe, expect, it } from "vitest";
import {
  normalizeCompany,
  parseLinkedinConnections,
  rankContact,
  splitCsvLine,
  startOfWeek,
} from "@/models/people.model";

const CSV = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Dana,Levi,https://www.linkedin.com/in/dana-levi,,"Venture, Capital Ltd",General Partner,24 Nov 2026
Dana,Cohen,https://www.linkedin.com/in/dana,dana@x.io,Acme Security,"Senior PM, ""Core""",03 Jan 2020
,,,,,,
`;

describe("parseLinkedinConnections", () => {
  it("skips the notes, finds the header and parses quoted fields", () => {
    const rows = parseLinkedinConnections(CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Dana Levi",
      company: "Venture, Capital Ltd",
      position: "General Partner",
      email: null,
      linkedinUrl: "https://www.linkedin.com/in/dana-levi",
    });
    expect(rows[0].connectedOn?.toISOString().slice(0, 10)).toBe("2026-11-24");
    expect(rows[1].position).toBe('Senior PM, "Core"');
  });

  it("returns nothing for a file that isn't the export", () => {
    expect(parseLinkedinConnections("name,email\nx,y")).toEqual([]);
  });

  it("splits quoted CSV lines", () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(["a", "b, c", 'd "e"']);
  });
});

describe("rankContact", () => {
  const targets = new Set([normalizeCompany("Daylight Security")]);

  it("ranks founders, investors and people at board companies first", () => {
    expect(rankContact("Co-Founder & CEO", "Stealth", new Set()).priority).toBeGreaterThanOrEqual(35);
    expect(rankContact("General Partner", "Example Capital", new Set()).reason).toContain("investor");
    const atTarget = rankContact("Software Engineer", "Daylight", targets);
    expect(atTarget.priority).toBeGreaterThanOrEqual(35);
    expect(atTarget.reason).toContain("open job there");
  });

  it("scores someone with no signal at zero", () => {
    expect(rankContact("Accountant", "Bakery", new Set())).toEqual({ priority: 0, reason: "" });
  });

  it("caps at 100", () => {
    expect(rankContact("Founder, AI security", "Daylight Security", targets).priority).toBeLessThanOrEqual(100);
  });
});

describe("helpers", () => {
  it("normalizes company names", () => {
    expect(normalizeCompany("Team8 (stealth cyber startup)")).toBe("team8");
    expect(normalizeCompany("Fig Security")).toBe(normalizeCompany("fig"));
  });

  it("starts the week on Monday", () => {
    const wed = new Date(2026, 10, 25, 15); // Wed 25 Nov 2026
    const mon = startOfWeek(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(23);
    expect(startOfWeek(new Date(2026, 10, 29, 10)).getDate()).toBe(23); // Sunday belongs to that week
  });
});
