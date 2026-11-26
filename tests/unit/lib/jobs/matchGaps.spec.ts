import { parseMatchGaps } from "@/lib/jobs/matchGaps";

const body = `## Requirements
**Met**
- **4+ years in PM:** yes

**Partial**
- **Fortune 500 customers:** implied

**Missing**
- **Prompt and context structure design (required by the role's duties):** Not stated.
- **Reusable patterns (preferred):** Implied only.

## Skills
- **Matched:** x`;

describe("parseMatchGaps", () => {
  it("reads missing and partial labels from a match body", () => {
    const gaps = parseMatchGaps(JSON.stringify({ body }));
    expect(gaps.missing).toEqual(["Prompt and context structure design", "Reusable patterns"]);
    expect(gaps.partial).toEqual(["Fortune 500 customers"]);
  });
  it("reads plain (non-bold) labels too", () => {
    const plain = "**Missing**\n- SIEM detection content (preferred, inferred from the JD): no mention.\n- Formal \"Product Manager\" title (inferred): none.\n\n## Skills";
    expect(parseMatchGaps(JSON.stringify({ body: plain })).missing).toEqual(["SIEM detection content", 'Formal "Product Manager" title']);
  });
  it("takes the text after a bare Preferred: label", () => {
    const b = "**Missing**\n- Preferred: experience at a scaled SaaS company in a formal PM role. Address by x.\n\n## Skills";
    expect(parseMatchGaps(JSON.stringify({ body: b })).missing).toEqual(["experience at a scaled SaaS company in a formal PM role"]);
  });
  it("returns empty for prerank-only or bad data", () => {
    expect(parseMatchGaps(JSON.stringify({ prerankScore: 0.1 }))).toEqual({ missing: [], partial: [] });
    expect(parseMatchGaps("not json")).toEqual({ missing: [], partial: [] });
    expect(parseMatchGaps(null)).toEqual({ missing: [], partial: [] });
  });
});
