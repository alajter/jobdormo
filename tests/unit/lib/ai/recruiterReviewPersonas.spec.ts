import { describe, expect, it } from "vitest";
import {
  RECRUITER_PERSONAS,
  RECRUITER_PERSONA_IDS,
  buildRecruiterReviewPrompt,
  buildRecruiterReviewSystemPrompt,
  pickRecruiterPersona,
} from "@/lib/ai/prompts/recruiter-review";

describe("pickRecruiterPersona", () => {
  it("sends executive titles to the executive search partner", () => {
    expect(pickRecruiterPersona({ title: "VP Customer Success" })).toBe("partner");
    expect(pickRecruiterPersona({ title: "Chief Customer Officer" })).toBe("partner");
  });

  it("an executive role at a seed startup is still an executive hire", () => {
    expect(
      pickRecruiterPersona({ title: "VP Product", description: "Seed-stage stealth startup" }),
    ).toBe("partner");
  });

  it("sends stealth and founding roles to the kingmaker", () => {
    expect(pickRecruiterPersona({ title: "Founding Product Lead" })).toBe("kingmaker");
    expect(
      pickRecruiterPersona({ title: "Product Manager", description: "We are a stealth cyber startup" }),
    ).toBe("kingmaker");
  });

  it("sends large companies to the gatekeeper", () => {
    expect(
      pickRecruiterPersona({ title: "Product Manager", description: "A NASDAQ-listed multinational" }),
    ).toBe("gatekeeper");
  });

  it("defaults to the scale-up calibrator", () => {
    expect(pickRecruiterPersona({ title: "Product Manager", description: "Growing EASM company" })).toBe("calibrator");
  });

  it("never picks the talent partner on its own", () => {
    expect(pickRecruiterPersona({ title: "Product Manager", description: "VC portfolio company" })).not.toBe(
      "talent_partner",
    );
  });
});

describe("recruiter review prompts", () => {
  it("has a complete definition for every persona", () => {
    for (const id of RECRUITER_PERSONA_IDS) {
      const p = RECRUITER_PERSONAS[id];
      expect(p.id).toBe(id);
      expect(p.lens.length).toBeGreaterThanOrEqual(4);
      const system = buildRecruiterReviewSystemPrompt(id);
      expect(system).toContain(p.name);
      expect(system).toContain("## Fixes");
      expect(system).toMatch(/Never invent facts/);
    }
  });

  it("includes other material only when given", () => {
    const without = buildRecruiterReviewPrompt({ resumeText: "CV", jobText: "JOB" });
    expect(without).not.toContain("<other-material>");
    const withDocs = buildRecruiterReviewPrompt({ resumeText: "CV", jobText: "JOB", documents: "Dear team" });
    expect(withDocs).toContain("<other-material>");
    expect(withDocs).toContain("Dear team");
  });
});

describe("candidate notes", () => {
  it("adds the candidate's notes only when present", () => {
    const base = { resumeText: "CV", jobText: "JOB" };
    expect(buildRecruiterReviewPrompt(base)).not.toContain("<candidate-notes>");
    expect(buildRecruiterReviewPrompt({ ...base, candidateNotes: "  " })).not.toContain("<candidate-notes>");
    const p = buildRecruiterReviewPrompt({ ...base, candidateNotes: "Never claim sales." });
    expect(p).toContain("<candidate-notes>\nNever claim sales.\n</candidate-notes>");
  });

  it("tells every persona to follow the notes", () => {
    for (const id of RECRUITER_PERSONA_IDS) {
      expect(buildRecruiterReviewSystemPrompt(id)).toContain("<candidate-notes>");
    }
  });
});
