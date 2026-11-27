import { describe, expect, it } from "vitest";
import type { PageBreak, PageMetrics } from "@/lib/resume/paging";
import { blockKey, breakRules, breakSelector } from "./breakRules";

const metrics: PageMetrics = { pageHeight: 1000, sheetHeight: 1100, marginTop: 50, gap: 20 };
const item = (itemId: string, more = {}) => blockKey({ sectionId: "1", entryId: "e", itemId, ...more });
const at = (key: string, top: number, page: number): PageBreak => ({ key, top, page });

describe("breakSelector", () => {
  it.each([
    ["an item", item("x"), '[data-cv-page="p"] [data-section-id="1"] [data-entry-id="e"] [data-cv-item="x"]'],
    ["an entry's head", blockKey({ sectionId: "1", entryId: "e", itemId: null }), '[data-cv-page="p"] [data-section-id="1"] [data-entry-id="e"] [data-block="head"]'],
    ["a heading alone", blockKey({ sectionId: "1", entryId: null, itemId: null }), '[data-cv-page="p"] [data-section-id="1"] > [data-block="heading"]'],
    ["part of an item", item("q", { path: [2, 1] }), '[data-cv-page="p"] [data-section-id="1"] [data-entry-id="e"] [data-cv-item="q"] > :nth-child(2) > :nth-child(1)'],
  ])("%s", (_, key, selector) => expect(breakSelector(key, "p")).toBe(selector));

  // jsdom can't match such a selector; Chrome can.
  it("escapes ids", () =>
    expect(breakSelector(blockKey({ sectionId: "1", entryId: 'a"]', itemId: "b\\\n" }), "p")).toBe(
      '[data-cv-page="p"] [data-section-id="1"] [data-entry-id="a\\"]"] [data-cv-item="b\\\\\\a "]'
    ));
});

describe("breakRules", () => {
  it("is empty without breaks", () => expect(breakRules([], "p", metrics)).toBe(""));

  it("puts a block at the top of its page", () =>
    expect(breakRules([at(item("x"), 990, 1)], "p", metrics)).toBe(`${breakSelector(item("x"), "p")}{padding-top:130px!important}`));

  it("counts the space already added above", () =>
    // 130 above the first; the second is at 1900, so 2240 - 1900 - 130.
    expect(breakRules([at(item("x"), 990, 1), at(item("y"), 1900, 2)], "p", metrics).split("\n")[1]).toContain("padding-top:210px"));

  it("gives a block with a border of its own a margin", () =>
    expect(breakRules([at(item("q", { margin: true }), 990, 1)], "p", metrics)).toContain("{margin-top:130px!important}"));

  it("adds what measuring found missing, which isn't space above the next", () =>
    expect(
      breakRules([at(item("x"), 990, 1), at(item("y"), 1900, 2)], "p", metrics, [3, -2]).match(/[\d.]+px/g)
    ).toEqual(["133px", "208px"]));
});
