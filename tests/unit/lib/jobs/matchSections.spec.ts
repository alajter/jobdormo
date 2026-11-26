import { describe, expect, it } from "vitest";
import { parseMatchBody, postingRequirements, splitItem } from "@/lib/jobs/matchSections";

const body = `## Summary
Sam is a good fit. The main gap is PM tenure.

## Requirements
**Met**
- Highly technical products: attack surface at Globex, developer tools at Hooli.
- Working with enterprise customers: led saves at Hooli.

**Partial**
- 5+ years of Product Management: formal title only since Jul 2025.

**Missing**
- None outright. The gap is the PM-title tenure.

## Skills
**Matched:** 0-to-1 product, roadmap.

**Missing:** AI governance.

**Bonus:** an open-source CLI.

## Deal Breakers
None identified.

## Tailoring Tips
- **Headline/title:** Change to "Founding Product Manager".
- **Summary:** Add total years.`;

describe("parseMatchBody", () => {
  it("splits the analysis into summary, requirement groups, skills and tips", () => {
    const m = parseMatchBody(body)!;
    expect(m.summary).toBe("Sam is a good fit. The main gap is PM tenure.");
    expect(m.met).toEqual([
      { label: "Highly technical products", detail: "attack surface at Globex, developer tools at Hooli." },
      { label: "Working with enterprise customers", detail: "led saves at Hooli." },
    ]);
    expect(m.partial[0].label).toBe("5+ years of Product Management");
    expect(m.missing).toEqual([]); // "None outright" is not a missing requirement
    expect(m.skills.matched).toBe("0-to-1 product, roadmap.");
    expect(m.skills.missing).toBe("AI governance.");
    expect(m.dealBreakers).toBe("");
    expect(m.tips[0]).toEqual({ label: "Headline/title", detail: 'Change to "Founding Product Manager".' });
  });
  it("returns null for text that isn't a sectioned analysis", () => {
    expect(parseMatchBody("just text")).toBeNull();
    expect(parseMatchBody(null)).toBeNull();
  });
  it("names a tagged requirement after its tag", () => {
    expect(splitItem("- Preferred: AppSec PM title: early-stage only")).toEqual({ label: "AppSec PM title (preferred)", detail: "early-stage only" });
  });
  it("keeps a line without a label as detail", () => {
    expect(splitItem("- Plain sentence")).toEqual({ label: "", detail: "Plain sentence" });
  });
});

describe("postingRequirements", () => {
  it("reads the bullets under a requirements heading", () => {
    const html = "<p>About us</p><ul><li>Free lunch</li></ul><p><strong>Requirements</strong></p><ul><li>5+ years PM</li><li>B2B SaaS &amp; security</li></ul><p>Benefits</p><ul><li>Gym</li></ul>";
    expect(postingRequirements(html)).toEqual(["5+ years PM", "B2B SaaS & security"]);
  });
});
