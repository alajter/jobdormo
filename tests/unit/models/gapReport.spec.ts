import { parseGapClusters } from "@/models/gapReport.model";

describe("parseGapClusters", () => {
  it("drops duplicate jobs inside a gap and sorts by job count", () => {
    const data = JSON.stringify([
      { gap: "A", advice: "x", jobs: [{ id: "1", company: "c", title: "t" }] },
      { gap: "B", advice: "y", jobs: [{ id: "2", company: "c", title: "t" }, { id: "2", company: "c", title: "t" }, { id: "3", company: "c", title: "t" }] },
    ]);
    const out = parseGapClusters(data);
    expect(out.map((c) => c.gap)).toEqual(["B", "A"]);
    expect(out[0].jobs.map((j) => j.id)).toEqual(["2", "3"]);
  });
  it("returns [] for bad data", () => {
    expect(parseGapClusters("nope")).toEqual([]);
  });
});
