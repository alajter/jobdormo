// Live persona check against the Anthropic API. Skipped unless ANTHROPIC_API_KEY and RR_DIR are set.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  buildRecruiterReviewPrompt,
  buildRecruiterReviewSystemPrompt,
  pickRecruiterPersona,
} from "@/lib/ai/prompts/recruiter-review";

const dir = process.env.RR_DIR;
describe.skipIf(!process.env.ANTHROPIC_API_KEY || !dir)("recruiter review (live)", () => {
  it("reviews in character with fixes", async () => {
    const read = (f: string) => readFileSync(`${dir}/${f}`, "utf8");
    const persona = pickRecruiterPersona({ title: "Founding Product Lead", description: read("job.txt") });
    const { text } = await generateText({
      model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })("claude-sonnet-5-5"),
      system: buildRecruiterReviewSystemPrompt(persona),
      prompt: buildRecruiterReviewPrompt({ resumeText: read("cv.txt"), jobText: read("job.txt"), documents: read("letter.txt"), candidateNotes: process.env.RR_NOTES ? read("notes.txt") : undefined }),
    });
    if (process.env.RR_OUT) (await import("node:fs")).writeFileSync(process.env.RR_OUT, `PERSONA=${persona}\n\n${text}`);
    expect(text).toContain("---");
    expect(text).toMatch(/## Fixes/);
  }, 300_000);
});
