import { describe, expect, it } from "vitest";
import { axisTicks, closingLabel, closesLabel, donutSegments } from "./chart";

describe("axisTicks", () => {
  it("uses whole numbers that cover the maximum", () => {
    expect(axisTicks(0)).toEqual([0, 1]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(17)).toEqual([0, 5, 10, 15, 20]);
    expect(axisTicks(130)).toEqual([0, 50, 100, 150]);
  });
});

describe("donutSegments", () => {
  it("skips zeros and leaves a gap between segments", () => {
    expect(donutSegments([1, 0, 3], 100, 2)).toEqual([
      { index: 0, start: 0, length: 23 },
      { index: 2, start: 25, length: 73 },
    ]);
  });

  it("draws one value as a full ring and nothing for no values", () => {
    expect(donutSegments([0, 4], 100, 2)).toEqual([{ index: 1, start: 0, length: 100 }]);
    expect(donutSegments([0, 0], 100, 2)).toEqual([]);
  });
});

describe("closingLabel", () => {
  const now = new Date(2026, 7, 21, 18);

  it("counts calendar days", () => {
    expect(closingLabel(new Date(2026, 7, 21).toISOString(), now)).toBe("Today");
    expect(closingLabel(new Date(2026, 7, 22).toISOString(), now)).toBe("Tomorrow");
    expect(closingLabel(new Date(2026, 7, 24).toISOString(), now)).toBe("In 3 days");
  });
});

describe("closesLabel", () => {
  const now = new Date(2026, 10, 23, 12);
  it("says when the job closes, or that it has", () => {
    expect(closesLabel(new Date(2026, 10, 27).toISOString(), now)).toBe("Closes in 4 days");
    expect(closesLabel(new Date(2026, 10, 23).toISOString(), now)).toBe("Closes today");
    expect(closesLabel(new Date(2026, 10, 22).toISOString(), now)).toBe("Closed");
  });
});
