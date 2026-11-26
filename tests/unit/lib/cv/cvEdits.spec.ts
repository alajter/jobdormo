import { keywordCoverage, applyCvEdits, listCvBlocks, sanitizeInline } from "@/lib/cv/cvEdits";

const html = `<h2>SUMMARY</h2>
<p>I build products.</p>
<div class="role"><span class="rtitle">VP</span> · <span class="co">Acme</span></div>
<ul>
    <li>First bullet.</li>
    <li>Second &amp; bullet.</li>
</ul>
<table><tr><td class="k">AI</td><td>LLM apps</td></tr></table>`;

describe("cvEdits", () => {
  it("numbers summary, bullets and skill cells", () => {
    const b = listCvBlocks(html);
    expect(b.map((x) => [x.kind, x.text])).toEqual([
      ["summary", "I build products."],
      ["bullet", "First bullet."],
      ["bullet", "Second & bullet."],
      ["skill", "LLM apps"],
    ]);
  });
  it("gives each block its context", () => {
    expect(listCvBlocks(html).map((b) => b.context)).toEqual(["Summary", "VP · Acme", "VP · Acme", "Skills: AI"]);
  });
  it("replaces and inserts by index, keeping the rest intact", () => {
    const { html: out, applied } = applyCvEdits(html, [
      { action: "replace", index: 1, html: "First bullet, with <b>numbers</b>." },
      { action: "insert_after", index: 2, html: "New bullet." },
      { action: "replace", index: 3, html: "LLM apps, prompt design" },
      { action: "insert_after", index: 0, html: "ignored: not after a bullet" },
      { action: "replace", index: 99, html: "ignored" },
    ]);
    expect(applied).toBe(3);
    expect(out).toContain("<li>First bullet, with <b>numbers</b>.</li>");
    expect(out).toContain("<li>Second &amp; bullet.</li>\n    <li>New bullet.</li>");
    expect(out).toContain("<td>LLM apps, prompt design</td>");
    expect(out).toContain("<p>I build products.</p>");
    expect(out).not.toContain("ignored");
  });
  it("strips unsafe markup", () => {
    expect(sanitizeInline("<script>x</script>Hi <b>there</b> & <img src=x>")).toBe("xHi <b>there</b> &amp;");
  });

  it("rewrites a bullet and adds one after it in the same step without splicing them", () => {
    const html = "<ul>\n    <li>Short bullet.</li>\n    <li>Next.</li>\n</ul>";
    for (const order of [0, 1]) {
      const edits = [
        { action: "replace" as const, index: 0, html: "A much longer rewritten bullet that ends cleanly." },
        { action: "insert_after" as const, index: 0, html: "Brand new bullet." },
      ];
      const { html: out, applied } = applyCvEdits(html, order ? edits.reverse() : edits);
      expect(applied).toBe(2);
      expect(out).toContain("<li>A much longer rewritten bullet that ends cleanly.</li>\n    <li>Brand new bullet.</li>");
      expect(out).toContain("<li>Next.</li>");
    }
  });

  it("removes a bullet with its line", () => {
    const html = "<ul>\n    <li>Keep.</li>\n    <li>Drop.</li>\n</ul>";
    const { html: out, applied } = applyCvEdits(html, [{ action: "remove", index: 1 }]);
    expect(applied).toBe(1);
    expect(out).toBe("<ul>\n    <li>Keep.</li>\n</ul>");
  });

  it("scores ATS keyword coverage on the visible text only", () => {
    const html = "<style>.x{content:'roadmap'}</style><p>Owned the <b>roadmap</b> for AI agents &amp; APIs</p>";
    expect(keywordCoverage(html, ["Roadmap", "AI agents", "SOC"])).toEqual({ score: 67, missing: ["SOC"] });
    expect(keywordCoverage(html, [])).toEqual({ score: 0, missing: [] });
  });
});
