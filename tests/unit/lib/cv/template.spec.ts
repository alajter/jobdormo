import { describe, expect, it } from "vitest";
import { normalizeStructuredCv, renderCvHtml } from "@/lib/cv/template";
import { listCvBlocks, keywordCoverage } from "@/lib/cv/cvEdits";

const cv = normalizeStructuredCv({
  name: "Sam Rivera",
  headline: "Senior Product Manager · B2B SaaS",
  contact: ["Berlin", "sam@example.com"],
  summary: "Product manager who ships with customers.",
  experience: [
    { title: "Senior PM", company: "Acme <Labs>", dates: "2021 – Present", bullets: ["Led discovery with 12 design partners.", "Shipped SSO & audit logs."] },
  ],
  projects: [{ name: "Tool", url: "javascript:alert(1)", description: "A CLI." }],
  education: [{ degree: "BSc Computer Science", school: "TU Berlin" }],
  skills: [{ label: "Product", items: "Discovery, roadmaps" }],
})!;

describe("CV template", () => {
  it("renders the structure tailoring reads: summary, role context, bullets, skill rows", () => {
    const html = renderCvHtml(cv);
    const blocks = listCvBlocks(html);
    expect(blocks.find((b) => b.kind === "summary")?.text).toBe("Product manager who ships with customers.");
    expect(blocks.filter((b) => b.kind === "bullet").map((b) => b.text)).toContain("Shipped SSO & audit logs.");
    expect(blocks.find((b) => b.text.startsWith("Led discovery"))?.context).toContain("Senior PM");
    expect(blocks.some((b) => b.kind === "skill")).toBe(true);
    expect(html).toContain('<p class="headline">Senior Product Manager · B2B SaaS</p>');
    expect(keywordCoverage(html, ["design partners", "SSO"]).score).toBe(100);
  });
  it("escapes text and drops unsafe links", () => {
    const html = renderCvHtml(cv);
    expect(html).toContain("Acme &lt;Labs&gt;");
    expect(html).not.toContain("javascript:");
  });
  it("needs a name and at least one role", () => {
    expect(normalizeStructuredCv({ name: "X", experience: [] })).toBeNull();
    expect(normalizeStructuredCv(null)).toBeNull();
  });
});
