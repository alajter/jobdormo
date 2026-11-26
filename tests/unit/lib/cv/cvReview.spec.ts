import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/people/voice", () => ({}));
vi.mock("@/lib/cv/tracks", () => ({}));
import { structuralIssues } from "@/lib/cv/review";

const role = (t: string, co: string, d: string) =>
  `<div class="rhead"><span><span class="rtitle">${t}</span> · <span class="co">${co}</span></span><span class="dates">${d}</span></div>`;
const cv = (contact: string, ...roles: string[]) => `<p class="contact">${contact}</p>${roles.join("")}`;

describe("structuralIssues", () => {
  const base = cv("Tel Aviv · me@x.com", role("VP Global Customer Success", "Globex", "Jan 2023 – Jun 2025"), role("Integration Manager", "Umbrella", "Oct 2006 – Jun 2012"));

  it("passes a tailored CV that keeps titles, employers, dates and contact", () => {
    expect(structuralIssues(base, base)).toEqual([]);
  });

  it("flags a changed title or date as high", () => {
    const tailored = cv("Tel Aviv · me@x.com", role("VP Product", "Globex", "Jan 2023 – Jun 2025"), role("Integration Manager", "Umbrella", "Oct 2006 – Jun 2012"));
    const issues = structuralIssues(base, tailored);
    expect(issues.some((i) => i.severity === "high" && i.quote.includes("VP Product"))).toBe(true);
  });

  it("flags a changed contact line and offers the original", () => {
    const tailored = cv("Remote · me@x.com", role("VP Global Customer Success", "Globex", "Jan 2023 – Jun 2025"), role("Integration Manager", "Umbrella", "Oct 2006 – Jun 2012"));
    const issue = structuralIssues(base, tailored).find((i) => i.quote.startsWith("Remote"));
    expect(issue?.fix).toBe("Tel Aviv · me@x.com");
  });
});

describe("replaceVisibleText", () => {
  it("replaces text that spans tags and entities in a non-bullet line", async () => {
    const { replaceVisibleText } = await import("@/lib/cv/review");
    const html = `<html><head><title>CV – X</title></head><body><p class="tag"><b>Stealth startup</b> <i>(AI for application security)</i>, Jul 2025 – Oct 2025</p><li>R&amp;D work</li></body></html>`;
    const out = replaceVisibleText(html, "Stealth startup (AI for application security), Jul 2025 – Oct 2025", "Stealth startup, Jan 2025 – Oct 2025");
    expect(out).toContain("Stealth startup, Jan 2025 – Oct 2025");
    expect(out).toContain("<title>CV – X</title>");
    expect(replaceVisibleText(html, "R&D work", "R&D and product")).toContain("R&amp;D and product");
    expect(replaceVisibleText(html, "CV – X", "nope")).toBeNull(); // the <title> isn't page text
  });
});
