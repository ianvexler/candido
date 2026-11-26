import { afterEach, describe, expect, it } from "vitest";
import { blockAt, gapAt } from "./pagePlaces";

let root: HTMLElement;

/** Boxes come from data-box="top,bottom" and data-x="left,right", in sheet px; without a box it isn't shown. */
const page = (html: string, scale = 1) => {
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
  Object.defineProperty(root, "offsetWidth", { value: 800 });
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

const at = (y: number, x = 400, scale = 1) => gapAt(root, scale, x * scale, y * scale);
const what = (y: number, x?: number, scale?: number) => {
  const gap = at(y, x, scale);
  if (!gap) return null;
  return gap.kind === "add" ? { kind: "add", place: gap.place } : { kind: "section", afterSectionId: gap.afterSectionId };
};

afterEach(() => root.remove());

describe("gapAt", () => {
  it("finds the gap between two bullets near it, after the bullet above", () => {
    page(classic);
    expect(what(143)).toEqual({ kind: "add", place: { sectionId: 1, entryId: "e1", after: "b1" } });
    expect(at(143)?.top).toBe(142);
    expect(what(150)).toBeNull();
  });

  it("puts what is under an entry's title line before its first item", () => {
    page(classic);
    expect(what(122)).toEqual({ kind: "add", place: { sectionId: 1, entryId: "e1", after: null } });
  });

  it("adds right under a section heading at the top of the section", () => {
    page(classic);
    expect(what(97)).toEqual({ kind: "add", place: { sectionId: 1, entryId: null, after: null } });
  });

  it("splits the gap between sections: add for the one above, then a section after it", () => {
    page(classic);
    expect(what(164)).toEqual({ kind: "add", place: { sectionId: 1, entryId: "e1", after: "b2" } });
    expect(what(168)).toEqual({ kind: "section", afterSectionId: 1 });
  });

  it("adds a section first between the header and the first section", () => {
    page(classic);
    expect(what(72)).toEqual({ kind: "section", afterSectionId: null });
  });

  it("has both after the column's last section, ending 24px below it", () => {
    page(classic);
    expect(what(225)).toEqual({ kind: "add", place: { sectionId: 2, entryId: "e2", after: "c1" } });
    expect(what(240)).toEqual({ kind: "section", afterSectionId: 2 });
    expect(what(246)).toBeNull();
  });

  it("gives the column's content edges and the side it is nearest", () => {
    page(classic.replace('class="resume-classic"', 'class="resume-classic" style="padding-left: 40px; padding-right: 30px"'));
    expect(at(143)).toMatchObject({ left: 40, right: 770, side: "left" });
  });

  it("reads a scaled page from client coordinates, in sheet units", () => {
    page(classic, 0.75);
    expect(what(143, 400, 0.75)).toEqual({ kind: "add", place: { sectionId: 1, entryId: "e1", after: "b1" } });
    expect(at(143, 400, 0.75)?.top).toBeCloseTo(142);
    expect(what(150, 400, 0.75)).toBeNull();
    expect(what(168, 400, 0.75)).toEqual({ kind: "section", afterSectionId: 1 });
    expect(at(168, 400, 0.75)?.right).toBeCloseTo(800);
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
    expect(what(119, 100)).toEqual({ kind: "add", place: { sectionId: 3, entryId: "s1", after: "k1" } });
    expect(at(119, 100)?.side).toBe("left");
    expect(what(119, 500)).toBeNull();
    expect(what(58, 500)).toEqual({ kind: "add", place: { sectionId: 4, entryId: null, after: null } });
    expect(at(58, 500)?.side).toBe("right");
    expect(what(58, 100)).toBeNull();
  });

  it("puts a gap across a page break at the top of the next page's block", () => {
    page(
      `<div class="resume-classic" data-paper="a4" data-box="0,2300">${header}` +
        '<section data-section-id="1"><div data-entry-id="e1"><div data-block="head" data-box="940,956"><h3 data-box="940,956"></h3></div>' +
        // The break's space is the last bullet's padding: its text starts at 1220, on the second sheet.
        bullets([["b0", 960, 976], ["b1", 980, 996], ["b2", 1000, 1236]], ' style="padding-top: 220px"') +
        "</div></section></div>"
    );
    const gap = at(1219);
    expect(gap?.top).toBe(1218);
    // The first sheet ends at 1122.5, the second starts at 1144.5.
    expect(gap!.top).toBeGreaterThan(1144.5);
    expect(what(1219)).toEqual({ kind: "add", place: { sectionId: 1, entryId: "e1", after: "b1" } });
    expect(what(1108)).toBeNull();
  });
});

describe("blockAt", () => {
  const target = (selector: string) => root.querySelector(selector)!;

  it("is the innermost block under the pointer", () => {
    page(classic);
    expect(blockAt(root, target('[data-cv-item="b2"]'))).toEqual({ sectionId: 1, kind: "item", entryId: "e1", itemId: "b2", top: 144, side: "left" });
    expect(blockAt(root, target(".rc-summary"))).toMatchObject({ kind: "summary", entryId: "e1", top: 116 });
    expect(blockAt(root, target('[data-section-id="2"] .rc-heading'))).toMatchObject({ sectionId: 2, kind: "heading", top: 172 });
    expect(blockAt(root, target('[data-section-id="1"] h3'))).toMatchObject({ kind: "entry", entryId: "e1", top: 100 });
  });

  it("has none for the header", () => {
    page(classic);
    expect(blockAt(root, target("header"))).toBeNull();
  });

  it("gives its top in sheet units on a scaled page", () => {
    page(classic, 0.75);
    expect(blockAt(root, target('[data-cv-item="b2"]'))?.top).toBeCloseTo(144);
  });
});
