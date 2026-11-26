import { parsePostedDate, postedAgo } from "@/lib/jobs/postedDate";

const now = new Date("2026-11-24T12:00:00Z");
describe("parsePostedDate", () => {
  it("reads ISO strings, dates and epoch seconds or ms", () => {
    expect(parsePostedDate("2026-11-08", now)?.toISOString().slice(0, 10)).toBe("2026-11-08");
    expect(parsePostedDate(1763000000, now)?.getFullYear()).toBe(2025);
    expect(parsePostedDate(1763000000000, now)?.getFullYear()).toBe(2025);
    expect(parsePostedDate("1763000000", now)?.getFullYear()).toBe(2025);
  });
  it("rejects missing, invalid, future and very old dates", () => {
    expect(parsePostedDate(undefined, now)).toBeNull();
    expect(parsePostedDate("not a date", now)).toBeNull();
    expect(parsePostedDate("2027-01-01", now)).toBeNull();
    expect(parsePostedDate("2010-01-01", now)).toBeNull();
  });
});
describe("postedAgo", () => {
  it("formats relative ages", () => {
    expect(postedAgo("2026-11-24T08:00:00Z", now)).toBe("today");
    expect(postedAgo("2026-11-21T12:00:00Z", now)).toBe("3d ago");
    expect(postedAgo("2026-10-24T12:00:00Z", now)).toBe("4w ago");
    expect(postedAgo("2026-07-24T12:00:00Z", now)).toBe("4mo ago");
  });
});

describe("parseSavedSort", () => {
  it("restores a valid saved sort and rejects anything else", async () => {
    const { parseSavedSort } = await import("@/hooks/useSort");
    const natural = { postedAt: "desc", title: "asc" } as const;
    expect(parseSavedSort('{"field":"postedAt","dir":"desc"}', natural)).toEqual({ field: "postedAt", dir: "desc" });
    expect(parseSavedSort('{"field":"bogus","dir":"desc"}', natural)).toBeNull();
    expect(parseSavedSort('{"field":"title","dir":"up"}', natural)).toBeNull();
    expect(parseSavedSort("not json", natural)).toBeNull();
    expect(parseSavedSort(null, natural)).toBeNull();
  });
});
