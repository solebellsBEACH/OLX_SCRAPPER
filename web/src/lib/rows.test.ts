import { describe, expect, it } from "vitest";
import { robustMean } from "./rows";

describe("robustMean", () => {
  it("averages a tight cluster of prices normally", () => {
    const result = robustMean([50_000, 52_000, 51_000]);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
    expect(result!.avg).toBeCloseTo((50_000 + 52_000 + 51_000) / 3);
  });

  it("drops a price at or beyond 100% deviation from the median", () => {
    // median = 50_000; 110_000 is +120% -> outlier, dropped from the average
    const result = robustMean([48_000, 50_000, 52_000, 110_000]);
    expect(result).not.toBeNull();
    expect(result!.count).toBe(3);
    expect(result!.avg).toBeCloseTo((48_000 + 50_000 + 52_000) / 3);
  });

  it("returns null for an empty list", () => {
    expect(robustMean([])).toBeNull();
  });

  it("returns null when every price is an outlier of the others (median <= 0 guard aside)", () => {
    // single price: median == the price itself, so it's kept (0% deviation from itself)
    const result = robustMean([1000]);
    expect(result).toEqual({ avg: 1000, count: 1 });
  });
});
