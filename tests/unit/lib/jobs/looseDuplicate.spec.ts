import { describe, expect, it } from "vitest";
import { findLooseDuplicate } from "@/lib/jobs/looseDuplicate";

const board = [
  { company: "Team8 (stealth cyber startup)", title: "Founding Product Lead" },
  { company: "Team8 (stealth cyber startup)", title: "Product Manager, AI Security" },
  { company: "Acme", title: "Product Manager" },
];

describe("findLooseDuplicate", () => {
  it("matches a title with the company folded into it", () => {
    expect(
      findLooseDuplicate({ company: "Team8", title: "Team8 Stealth Cyber Startup - Founding Product Lead" }, board),
    ).toBe(board[0]);
    expect(
      findLooseDuplicate({ company: "Team8", title: "Team8 Cyber Stealth Startup-Product Manager, AI Security" }, board),
    ).toBe(board[1]);
  });

  it("matches the same title with different punctuation", () => {
    expect(findLooseDuplicate({ company: "ACME Inc", title: "Product-Manager" }, board)).toBe(board[2]);
  });

  it("keeps a different role at the same company", () => {
    expect(findLooseDuplicate({ company: "Acme", title: "Senior Product Manager" }, board)).toBeUndefined();
    expect(findLooseDuplicate({ company: "Team8", title: "Product Manager, SASE" }, board)).toBeUndefined();
  });

  it("keeps the same title at another company", () => {
    expect(findLooseDuplicate({ company: "Other", title: "Founding Product Lead" }, board)).toBeUndefined();
  });
});
