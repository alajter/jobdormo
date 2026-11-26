import { guessTrack } from "@/models/cvTrack.model";

const ids = ["founding", "ai-pm", "security-pm", "cs-leader"];
describe("guessTrack", () => {
  it("routes by title first, then company area", () => {
    expect(guessTrack("VP Customer Success & Delivery", ["security"], ids)).toBe("cs-leader");
    expect(guessTrack("Founding Product Lead", ["ai"], ids)).toBe("founding");
    expect(guessTrack("Head of Product", [], ids)).toBe("founding");
    expect(guessTrack("Principal AI Product Manager", ["other"], ids)).toBe("ai-pm");
    expect(guessTrack("Senior Security Product Manager", ["security", "ai"], ids)).toBe("security-pm");
    expect(guessTrack("Senior Product Manager", ["security", "ai"], ids)).toBe("security-pm");
    expect(guessTrack("Product Manager", ["ai", "devtools"], ids)).toBe("ai-pm");
    expect(guessTrack("Product Manager", ["fintech"], ids)).toBe("founding");
  });
  it("only returns tracks that exist", () => {
    expect(guessTrack("VP Customer Success", [], ["founding"])).toBe("founding");
    expect(guessTrack("x", [], [])).toBeNull();
  });
});
