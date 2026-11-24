import { describe, expect, it } from "vitest";
import { combineColumns, fitMessage, paginate, spaceBefore, type Block, type PageMetrics } from "./paging";

const b = (key: string | null, top: number, bottom: number): Block => ({ key, top, bottom, keepWithNext: false });
const head = (key: string | null, top: number, bottom: number): Block => ({ key, top, bottom, keepWithNext: true });

describe("paginate", () => {
  it("starts a page with the block that doesn't fit", () =>
    expect(paginate([b("a", 0, 60), b("b", 60, 110)], 100)).toMatchObject({
      pages: 2,
      used: 50,
      breaks: [{ key: "b", top: 60, page: 1 }],
    }));

  it("takes the head along with what follows", () =>
    expect(paginate([b("a", 0, 60), head("h", 60, 80), b("b", 80, 130)], 100).breaks[0].key).toBe("h"));

  it("takes a chain of heads along", () =>
    expect(
      paginate([b("a", 0, 40), head("h1", 40, 60), head("h2", 60, 80), b("b", 80, 130)], 100).breaks.map((x) => x.key),
    ).toEqual(["h1"]));

  it("ends with a block taller than a page", () =>
    expect(paginate([b("a", 0, 250)], 100)).toMatchObject({ pages: 3, used: 50, breaks: [] }));

  it("starts a block taller than a page on a new page when something is above it", () =>
    expect(paginate([b("a", 0, 30), b("t", 30, 280)], 100)).toMatchObject({
      pages: 4,
      used: 50,
      breaks: [{ key: "t", top: 30, page: 1 }],
    }));

  it("continues after a tall block on its last page", () =>
    expect(paginate([b("t", 0, 250), b("a", 250, 280), b("c", 280, 290)], 100)).toMatchObject({
      pages: 3,
      used: 90,
      breaks: [],
    }));

  it("breaks after a tall block when the next doesn't fit", () =>
    expect(paginate([b("t", 0, 250), b("a", 250, 320)], 100)).toMatchObject({
      pages: 4,
      used: 70,
      breaks: [{ key: "a", top: 250, page: 3 }],
    }));

  it("drops the gap before a block that starts a page", () =>
    expect(paginate([b("a", 0, 90), b("b", 110, 130)], 100)).toMatchObject({ pages: 2, used: 20 }));

  it("allows for rounding", () => expect(paginate([b("a", 0, 100.4)], 100).pages).toBe(1));

  it("has one page when empty", () => expect(paginate([], 100)).toEqual({ breaks: [], pages: 1, used: 0 }));

  it("ends with a chain of heads longer than a page", () => {
    const blocks = [head("h1", 0, 60), head("h2", 60, 120), head("h3", 120, 180), b("x", 180, 240)];
    const result = paginate(blocks, 100);
    expect(result.pages).toBeGreaterThanOrEqual(2);
    expect(result.pages).toBeLessThanOrEqual(4);
  });

  it("breaks at the block itself when a head can't keep its block and starts the page", () =>
    expect(paginate([head("h", 0, 60), b("b", 60, 130)], 100)).toMatchObject({
      pages: 2,
      used: 70,
      breaks: [{ key: "b", top: 60, page: 1 }],
    }));

  it("breaks at the nearest keyed block before one without a key", () =>
    expect(paginate([b("a", 0, 30), b("c", 30, 60), b(null, 60, 110)], 100)).toMatchObject({
      pages: 2,
      used: 80,
      breaks: [{ key: "c", top: 30, page: 1 }],
    }));

  it("counts the page but emits no rule when nothing earlier can start it", () =>
    expect(paginate([b("a", 0, 60), b(null, 60, 110)], 100)).toMatchObject({ pages: 2, used: 50, breaks: [] }));
});

describe("combineColumns", () => {
  it("takes the side when it is longer", () =>
    expect(combineColumns([{ pages: 2, used: 30 }, { pages: 1, used: 90 }])).toEqual({ pages: 2, used: 30 }));
  it("takes the main column when it is longer", () =>
    expect(combineColumns([{ pages: 1, used: 90 }, { pages: 3, used: 20 }])).toEqual({ pages: 3, used: 20 }));
  it("takes the larger use when equal", () =>
    expect(combineColumns([{ pages: 2, used: 30 }, { pages: 2, used: 70 }])).toEqual({ pages: 2, used: 70 }));
  it("has one page without columns", () => expect(combineColumns([])).toEqual({ pages: 1, used: 0 }));
});

describe("spaceBefore", () => {
  const metrics: PageMetrics = { pageHeight: 900, sheetHeight: 1000, marginTop: 50, gap: 20 };
  it("pads the second page", () => expect(spaceBefore(880, 1, 0, metrics)).toBe(140));
  it("pads the third page, minus what is already added", () => expect(spaceBefore(1800, 2, 140, metrics)).toBe(100));
});

describe("fitMessage", () => {
  const m: PageMetrics = { pageHeight: 900, sheetHeight: 1000, marginTop: 50, gap: 20 };
  it("counts spare lines", () => expect(fitMessage({ pages: 1, used: 720 }, m, 20, true)).toBe("Fits one page, 9 lines spare"));
  it("says exactly when full", () => expect(fitMessage({ pages: 1, used: 900 }, m, 20, true)).toBe("Fits one page exactly"));
  it("uses the singular", () => expect(fitMessage({ pages: 1, used: 875 }, m, 20, true)).toBe("Fits one page, 1 line spare"));
  it("rounds spare lines down", () => expect(fitMessage({ pages: 1, used: 721 }, m, 20, true)).toBe("Fits one page, 8 lines spare"));
  it("suggests a cut for two pages", () =>
    expect(fitMessage({ pages: 2, used: 200 }, m, 20, true)).toBe("2 pages. Cut about 10 lines to fit one."));
  it("rounds the cut up", () =>
    expect(fitMessage({ pages: 2, used: 201 }, m, 20, true)).toBe("2 pages. Cut about 11 lines to fit one."));
  it("names two for three pages", () =>
    expect(fitMessage({ pages: 3, used: 100 }, m, 20, true)).toBe("3 pages. Cut about 5 lines to fit two."));
  it("gives only the count when the last page is half full", () =>
    expect(fitMessage({ pages: 2, used: 450 }, m, 20, true)).toBe("2 pages"));
  it("uses digits from ten", () =>
    expect(fitMessage({ pages: 11, used: 100 }, m, 20, true)).toBe("11 pages. Cut about 5 lines to fit 10."));
  it("says about when not exact", () => {
    expect(fitMessage({ pages: 1, used: 720 }, m, 20, false)).toBe("About one page, 9 lines spare");
    expect(fitMessage({ pages: 1, used: 900 }, m, 20, false)).toBe("About one page");
    expect(fitMessage({ pages: 2, used: 200 }, m, 20, false)).toBe("About 2 pages. Cut about 10 lines to fit one.");
    expect(fitMessage({ pages: 2, used: 450 }, m, 20, false)).toBe("About 2 pages");
  });
});
