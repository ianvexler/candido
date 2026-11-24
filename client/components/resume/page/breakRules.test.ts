import { describe, expect, it } from "vitest";
import type { PageBreak, PageMetrics } from "@/lib/resume/paging";
import { blockKey, breakRules, breakSelector } from "./breakRules";

const metrics: PageMetrics = { pageHeight: 1000, sheetHeight: 1100, marginTop: 50, gap: 20 };
const item = (itemId: string, more = {}) => blockKey({ sectionId: "1", entryId: "e", itemId, ...more });
const at = (key: string, top: number, page: number): PageBreak => ({ key, top, page });

describe("breakSelector", () => {
  it.each([
    ["an item", item("x"), '.paged-cv [data-section-id="1"] [data-entry-id="e"] [data-cv-item="x"]'],
    ["an entry's head", blockKey({ sectionId: "1", entryId: "e", itemId: null }), '.paged-cv [data-section-id="1"] [data-entry-id="e"] [data-block="head"]'],
    ["a heading alone", blockKey({ sectionId: "1", entryId: null, itemId: null }), '.paged-cv [data-section-id="1"] > [data-block="heading"]'],
    ["part of an item", item("q", { path: [2, 1] }), '.paged-cv [data-section-id="1"] [data-entry-id="e"] [data-cv-item="q"] > :nth-child(2) > :nth-child(1)'],
  ])("%s", (_, key, selector) => expect(breakSelector(key)).toBe(selector));

  // jsdom can't match such a selector; Chrome can.
  it("escapes ids", () =>
    expect(breakSelector(blockKey({ sectionId: "1", entryId: 'a"]', itemId: "b\\\n" }))).toBe(
      '.paged-cv [data-section-id="1"] [data-entry-id="a\\"]"] [data-cv-item="b\\\\\\a "]'
    ));
});

describe("breakRules", () => {
  it("is empty without breaks", () => expect(breakRules([], metrics)).toBe(""));

  it("puts a block at the top of its page", () =>
    expect(breakRules([at(item("x"), 990, 1)], metrics)).toBe(`${breakSelector(item("x"))}{padding-top:130px!important}`));

  it("counts the space already added above", () =>
    // 130 above the first; the second is at 1900, so 2240 - 1900 - 130.
    expect(breakRules([at(item("x"), 990, 1), at(item("y"), 1900, 2)], metrics).split("\n")[1]).toContain("padding-top:210px"));

  it("gives a block with a border of its own a margin", () =>
    expect(breakRules([at(item("q", { margin: true }), 990, 1)], metrics)).toContain("{margin-top:130px!important}"));

  it("adds what measuring found missing, which isn't space above the next", () =>
    expect(
      breakRules([at(item("x"), 990, 1), at(item("y"), 1900, 2)], metrics, [3, -2]).match(/[\d.]+px/g)
    ).toEqual(["133px", "208px"]));
});
