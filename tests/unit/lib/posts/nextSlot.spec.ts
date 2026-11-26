import { describe, expect, it } from "vitest";
import { nextPostSlot } from "@/lib/posts/nextSlot";

// Local times (the app runs on the owner's machine, in Israel).
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
const show = (d: Date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("nextPostSlot", () => {
  it("after a Thursday post, the next is Tuesday 08:30 (3+ days later)", () => {
    expect(show(nextPostSlot({ now: at(2026, 11, 26, 15), lastPostedAt: at(2026, 11, 26, 10) }))).toBe("Tue 1 8:30");
  });
  it("after a Tuesday post, the next Tuesday or Thursday at least 3 days later", () => {
    // Posted Tue 1 Dec: Thu 3 Dec is only 2 days later, so Tue 8 Dec.
    expect(show(nextPostSlot({ now: at(2026, 12, 1, 9), lastPostedAt: at(2026, 12, 1, 8, 30) }))).toBe("Tue 8 8:30");
  });
  it("with nothing posted, the next Tuesday or Thursday morning far enough ahead", () => {
    expect(show(nextPostSlot({ now: at(2026, 12, 1, 7) }))).toBe("Thu 3 8:30"); // Tue 08:30 is too close
    expect(show(nextPostSlot({ now: at(2026, 11, 30, 20) }))).toBe("Tue 1 8:30");
  });
  it("skips a day that already has a post scheduled", () => {
    expect(show(nextPostSlot({ now: at(2026, 11, 26, 15), lastPostedAt: at(2026, 11, 26, 10), taken: [at(2026, 12, 1, 8, 30)] }))).toBe("Thu 3 8:30");
  });
});
