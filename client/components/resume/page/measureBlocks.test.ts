import { afterEach, describe, expect, it } from "vitest";
import { measureColumns, printTop } from "./measureBlocks";

let root: HTMLElement;

/** Boxes come from data-box="top,bottom"; without one it isn't shown. */
const page = (html: string) => {
  root = document.createElement("div");
  root.innerHTML = `<div class="resume-classic" data-box="0,900"><section data-section-id="1"><div data-entry-id="e">${html}</div></section></div>`;
  document.body.append(root);
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const [top, bottom] = (element.dataset.box ?? "0,0").split(",").map(Number);
    element.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, width: bottom - top }) as DOMRect;
  });
  return measureColumns(root, 1)[0].blocks;
};
const brief = (html: string) => page(html).map(({ top, bottom, keepWithNext }) => [top, bottom, keepWithNext]);

afterEach(() => root.remove());

describe("measureColumns", () => {
  it("has heads, items and quotes' blocks, with the rest part of what it follows", () =>
    expect(
      brief(
        '<div data-block="head" data-box="0,20"><h3 data-box="0,20"></h3></div><div class="rc-body"><ul><li data-box="20,40"></li></ul>' +
          '<hr data-box="45,46"><blockquote data-cv-item="q"><p data-box="50,60"></p><ul><li data-box="60,70"></li></ul></blockquote><p data-box="0,0"></p></div>'
      )
    ).toEqual([[0, 20, true], [20, 46, false], [50, 60, false], [60, 70, false]]));

  it("starts a block at the first of it that shows", () => {
    const blocks = page(
      '<div data-block="head" data-box="10,40"><h2></h2><h3 data-box="12,40"></h3></div>' +
        '<div class="rc-body"><ul><li data-cv-item="a" data-box="50,80"><p></p><p data-box="52,80"></p></li><li data-cv-item="b" data-box="90,99"><p></p></li></ul></div>'
    );
    expect(blocks.map((block) => printTop(block, 1, true))).toEqual([12, 52, 90]);
  });
});
