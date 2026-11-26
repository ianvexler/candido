import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addPlaceOf, blockAt, blockBeside, gapAt } from "./pagePlaces";

let root: HTMLElement;
let shownAt = 1;

/** Line boxes come from data-lines="top,bottom;…"; without them, the element's box. */
beforeEach(() => {
  Range.prototype.getClientRects = function (this: Range) {
    const lines = (this.startContainer as HTMLElement).dataset?.lines;
    if (!lines) return [] as unknown as DOMRectList;
    return lines.split(";").map((line) => {
      const [top, bottom] = line.split(",").map((n) => Number(n) * shownAt);
      return { top, bottom, height: bottom - top } as DOMRect;
    }) as unknown as DOMRectList;
  };
});

/** Boxes come from data-box="top,bottom" and data-x="left,right", in sheet px; without a box it isn't shown. */
const page = (html: string, scale = 1) => {
  shownAt = scale;
  root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const [top, bottom] = (element.dataset.box ?? "0,0").split(",").map((n) => Number(n) * scale);
    const [left, right] = (element.dataset.x ?? "0,800").split(",").map((n) => Number(n) * scale);
    element.getBoundingClientRect = () =>
      ({ top, bottom, left, right, height: bottom - top, width: right - left }) as DOMRect;
  });
  root.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 800 * scale, height: 0, width: 800 * scale }) as DOMRect;
};

const bullets = (items: [string, number, number][], style = "") =>
  `<div class="rc-body"><div class="ProseMirror"><ul>${items
    .map(([id, top, bottom], index) => `<li data-cv-item="${id}" data-box="${top},${bottom}"${index === items.length - 1 ? style : ""}></li>`)
    .join("")}</ul></div></div>`;

const header = '<header data-block="header" data-box="0,60"></header>';
/** Section 1: its heading in e1's head, then two bullets 20px apart. Section 2 below it. */
const sections =
  '<section data-section-id="1"><div data-entry-id="e1">' +
  '<div data-block="head" data-box="80,120"><h2 class="rc-heading" data-box="80,96"></h2><h3 data-box="100,116"></h3><p class="rc-summary" data-box="116,120"></p></div>' +
  bullets([["b1", 124, 140], ["b2", 144, 160]]) +
  "</div></section>" +
  '<section data-section-id="2"><div data-entry-id="e2">' +
  '<div data-block="head" data-box="172,200"><h2 class="rc-heading" data-box="172,188"></h2><h3 data-box="192,200"></h3></div>' +
  bullets([["c1", 204, 220]]) +
  "</div></section>";
const classic = `<div class="resume-classic" data-paper="a4" data-box="0,1123">${header}${sections}</div>`;

const at = (y: number, x = 400, scale = 1, order = [1, 2]) => gapAt(root, scale, x * scale, y * scale, order);
const after = (y: number, x?: number, scale?: number, order?: number[]) => {
  const gap = at(y, x, scale, order);
  return gap ? gap.afterSectionId : undefined;
};

afterEach(() => root?.remove());

describe("addPlaceOf", () => {
  it("adds after an item, at the top of an entry's body by its title or summary, at a section's top by its heading", () => {
    expect(addPlaceOf({ sectionId: 1, kind: "item", entryId: "e1", itemId: "b1" })).toEqual({ sectionId: 1, entryId: "e1", after: "b1" });
    expect(addPlaceOf({ sectionId: 1, kind: "entry", entryId: "e1" })).toEqual({ sectionId: 1, entryId: "e1", after: null });
    expect(addPlaceOf({ sectionId: 1, kind: "summary", entryId: "e1" })).toEqual({ sectionId: 1, entryId: "e1", after: null });
    expect(addPlaceOf({ sectionId: 1, kind: "heading" })).toEqual({ sectionId: 1, entryId: null, after: null });
  });
});

describe("gapAt", () => {
  it("has no add points inside a section: only between sections", () => {
    page(classic);
    expect(at(142)).toBeNull();
    expect(at(122)).toBeNull();
    expect(at(98)).toBeNull();
  });

  it("finds a section after the one above across the whole gap between them, at least 16px", () => {
    page(classic);
    // Section 1 ends at 160, section 2 starts at 172: 12px, so 16 about its middle.
    [158, 160, 166, 173.5].forEach((y) => expect(after(y)).toBe(1));
    expect(at(166)?.top).toBe(166);
    expect(after(157)).toBeUndefined();
    expect(after(174.5)).toBeUndefined();
  });

  it("adds a section first across the gap between the header and the first section", () => {
    page(classic);
    [61, 70, 79].forEach((y) => expect(after(y)).toBeNull());
    expect(at(70)?.top).toBe(70);
  });

  it("has a section after the column's last one, from its foot to 24px below", () => {
    page(classic);
    [221, 232, 243].forEach((y) => expect(after(y)).toBe(2));
    expect(after(246)).toBeUndefined();
  });

  it("adds a section above the first section without a header shown", () => {
    page(classic.replace('data-box="0,60"', ""));
    expect(after(70)).toBeNull();
    expect(at(70)?.top).toBe(72);
    expect(after(63)).toBeUndefined();
  });

  it("keeps the trailing point on the last block's sheet", () => {
    page(`<div class="resume-classic" data-paper="a4" data-box="0,1123">${header}` +
      '<section data-section-id="1"><div data-entry-id="e1"><div data-block="head" data-box="1080,1096"><h3 data-box="1080,1096"></h3></div>' +
      bullets([["b1", 1100, 1110]]) + "</div></section></div>");
    // The first sheet ends at 1122.5.
    expect(after(1112)).toBe(1);
    expect(after(1120)).toBe(1);
    expect(after(1125)).toBeUndefined();
  });

  it("gives the column's content edges and the side it is nearest", () => {
    page(classic.replace('class="resume-classic"', 'class="resume-classic" style="padding-left: 40px; padding-right: 30px"'));
    expect(at(166)).toMatchObject({ left: 40, right: 770, side: "left" });
  });

  it("reads a scaled page from client coordinates, in sheet units, its least gap 16 screen px", () => {
    page(classic, 0.75);
    expect(after(166, 400, 0.75)).toBe(1);
    expect(at(166, 400, 0.75)?.top).toBeCloseTo(166);
    expect(at(166, 400, 0.75)?.right).toBeCloseTo(800);
    // 16 screen px are 21.3 sheet px: 155.3 to 176.7.
    expect(after(156, 400, 0.75)).toBe(1);
    expect(after(176, 400, 0.75)).toBe(1);
    expect(after(154, 400, 0.75)).toBeUndefined();
  });

  it("only finds a column's gaps over that column", () => {
    page(
      '<div class="resume-classic resume-sidebar" data-paper="a4" data-box="0,1123">' +
        `<aside class="rs-side" data-x="0,250" data-box="0,1123">${header}` +
        '<section data-section-id="3"><div data-entry-id="s1"><div data-block="head" data-box="80,96"><h2 class="rc-heading" data-box="80,96"></h2></div>' +
        bullets([["k1", 100, 116], ["k2", 120, 136]]) +
        "</div></section></aside>" +
        '<div class="rs-main" data-x="250,800" data-box="0,1123">' +
        '<section data-section-id="4"><div data-entry-id="m1"><div data-block="head" data-box="40,56"><h2 class="rc-heading" data-box="40,56"></h2></div>' +
        bullets([["w1", 60, 200]]) +
        "</div></section></div></div>"
    );
    expect(after(150, 100)).toBe(3);
    expect(at(150, 100)?.side).toBe("left");
    expect(after(150, 500)).toBeUndefined();
    expect(after(210, 500)).toBe(4);
    expect(at(210, 500)?.side).toBe("right");
    // Above each column's first section, after the section before it in the CV.
    expect(after(34, 500, 1, [3, 4])).toBe(3);
    expect(after(34, 500, 1, [4, 3])).toBeNull();
    expect(after(72, 100, 1, [4, 3])).toBe(4);
    expect(after(72, 100, 1, [3, 4])).toBeNull();
  });

  it("puts a gap across a page break at the top of the next page's section", () => {
    page(
      `<div class="resume-classic" data-paper="a4" data-box="0,2300">${header}` +
        '<section data-section-id="1"><div data-entry-id="e1"><div data-block="head" data-box="940,956"><h3 data-box="940,956"></h3></div>' +
        bullets([["b0", 960, 976], ["b1", 980, 996]]) +
        "</div></section>" +
        // The break's space is the heading's padding: its text starts at 1220, on the second sheet.
        '<section data-section-id="2"><div data-entry-id="e2"><div data-block="head" data-box="1000,1236" style="padding-top: 220px">' +
        '<h2 class="rc-heading" data-box="1220,1236"></h2></div>' +
        bullets([["c0", 1240, 1256], ["c1", 1260, 1276]]) +
        "</div></section></div>"
    );
    const gap = at(1219);
    // Half the column's usual gap above the next section: the first sheet ends at 1122.5, the second starts at 1144.5.
    expect(gap?.top).toBe(1218);
    expect(gap?.afterSectionId).toBe(1);
  });
});

describe("blockAt", () => {
  const target = (selector: string) => root.querySelector(selector)!;

  it("is the innermost block under the pointer", () => {
    page(classic);
    expect(blockAt(root, 1, target('[data-cv-item="b2"]'))).toEqual({
      sectionId: 1,
      kind: "item",
      entryId: "e1",
      itemId: "b2",
      top: 144,
      bottom: 160,
      line: 16,
      aim: 160,
      left: 0,
      right: 800,
      side: "left",
    });
    expect(blockAt(root, 1, target(".rc-summary"))).toMatchObject({ kind: "summary", entryId: "e1", top: 116 });
    expect(blockAt(root, 1, target('[data-section-id="2"] .rc-heading'))).toMatchObject({ sectionId: 2, kind: "heading", top: 172 });
    expect(blockAt(root, 1, target('[data-section-id="1"] h3'))).toMatchObject({ kind: "entry", entryId: "e1", top: 100 });
  });

  it("gives a paragraph's top from its first line, past a break's padding and its inline parts", () => {
    page(
      `<div class="resume-classic" data-paper="a4" data-box="0,2300">${header}<section data-section-id="1"><div data-entry-id="e1">` +
        '<div class="rc-body"><div class="ProseMirror">' +
        '<p data-cv-item="p1" data-box="300,332" data-lines="300,316;316,332">text <strong data-box="316,332"></strong></p>' +
        '<p data-cv-item="p2" data-box="1000,1236" style="padding-top: 220px" data-lines="1220,1236"></p>' +
        "</div></div></div></section></div>"
    );
    expect(blockAt(root, 1, target("strong"))).toMatchObject({ kind: "item", itemId: "p1", top: 300 });
    expect(blockAt(root, 1, target('[data-cv-item="p2"]'))).toMatchObject({ kind: "item", itemId: "p2", top: 1220 });
  });

  it("takes an entry's title line down to its last line, not its summary", () => {
    page(classic.replace('<h3 data-box="100,116"></h3>', '<h3 data-box="100,108"></h3><p data-box="108,116"></p>'));
    expect(blockAt(root, 1, target('[data-section-id="1"] h3'))).toMatchObject({ kind: "entry", top: 100, bottom: 116, line: 8 });
  });

  it("aims an entry's title line under its summary, where the top of its body is", () => {
    page(classic);
    expect(blockAt(root, 1, target('[data-section-id="1"] h3'))).toMatchObject({ kind: "entry", bottom: 116, aim: 120 });
    expect(blockAt(root, 1, target(".rc-summary"))).toMatchObject({ kind: "summary", aim: 120 });
  });

  it("has none for the header", () => {
    page(classic);
    expect(blockAt(root, 1, target("header"))).toBeNull();
  });

  it("gives its top in sheet units on a scaled page", () => {
    page(classic, 0.75);
    expect(blockAt(root, 0.75, target('[data-cv-item="b2"]'))?.top).toBeCloseTo(144);
  });
});

describe("blockBeside", () => {
  const original = document.elementsFromPoint;
  let probed: [number, number][] = [];
  const pointAt = (selector: string) => {
    probed = [];
    document.elementsFromPoint = (x: number, y: number) => {
      probed.push([x, y]);
      return [document.body, root.querySelector(selector)!];
    };
  };
  afterEach(() => {
    document.elementsFromPoint = original;
  });

  it("finds the block level with the pointer in its column's margin, by its middle", () => {
    page(classic.replace('class="resume-classic"', 'class="resume-classic" style="padding-left: 60px"'), 0.75);
    pointAt('[data-cv-item="b2"]');
    expect(blockBeside(root, 0.75, 20 * 0.75, 150 * 0.75)).toMatchObject({ kind: "item", itemId: "b2" });
    // Between the text's edges: (60 + 800) / 2.
    expect(probed[0][0]).toBeCloseTo(430 * 0.75);
    expect(probed[0][1]).toBeCloseTo(150 * 0.75);
  });

  it("has none over the text, or past a column's text on its far side", () => {
    page(classic.replace('class="resume-classic"', 'class="resume-classic" style="padding-left: 60px; padding-right: 60px"'));
    pointAt('[data-cv-item="b2"]');
    expect(blockBeside(root, 1, 300, 150)).toBeNull();
    expect(blockBeside(root, 1, 780, 150)).toBeNull();
  });

  it("takes the main column's margin on the right in the sidebar template", () => {
    page(
      '<div class="resume-classic resume-sidebar" data-paper="a4" data-box="0,1123">' +
        '<aside class="rs-side" data-x="0,250" data-box="0,1123" style="padding-left: 30px; padding-right: 26px">' +
        '<section data-section-id="3"><div data-entry-id="s1"><div data-block="head" data-box="80,96"><h2 class="rc-heading" data-box="80,96"></h2></div>' +
        "</div></section></aside>" +
        '<div class="rs-main" data-x="250,800" data-box="0,1123" style="padding-left: 26px; padding-right: 60px">' +
        '<section data-section-id="4"><div data-entry-id="m1"><div data-block="head" data-box="40,56"><h2 class="rc-heading" data-box="40,56"></h2></div>' +
        "</div></section></div></div>"
    );
    pointAt('[data-section-id="4"] .rc-heading');
    expect(blockBeside(root, 1, 780, 48)).toMatchObject({ sectionId: 4, kind: "heading", side: "right" });
    // The gutter between the columns isn't a margin.
    expect(blockBeside(root, 1, 260, 48)).toBeNull();
    pointAt('[data-section-id="3"] .rc-heading');
    expect(blockBeside(root, 1, 10, 88)).toMatchObject({ sectionId: 3, kind: "heading", side: "left" });
  });
});
