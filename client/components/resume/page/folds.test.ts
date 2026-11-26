import { emptyEntry } from "@/lib/resume/sectionEntries";
import { CurriculumSection, SectionEntry, SUMMARY_ID } from "@/lib/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findFolds, leftOutRuns } from "./folds";
import { MARK_SIZE } from "./HiddenTextMarks";

const li = (id: string, off = false, text = `Text ${id}`) =>
  `<li data-cv-item="${id}"${off ? ' data-cv-off="true"' : ""}><p>${text}</p></li>`;
const ul = (...items: string[]) => `<ul>${items.join("")}</ul>`;

const entry = (id: string, content = "", changes: Partial<SectionEntry> = {}): SectionEntry => ({
  ...emptyEntry(),
  id,
  title: `Entry ${id}`,
  content,
  ...changes,
});

const section = (id: number, entries: SectionEntry[], changes: Partial<CurriculumSection> = {}) =>
  ({
    id,
    section_type: `Section ${id}`,
    section_template_id: null,
    hidden: false,
    placement: null,
    base_items: {},
    base_fields: {},
    entries,
    ...changes,
  }) as CurriculumSection;

describe("leftOutRuns", () => {
  it("folds a run of left-out bullets after the shown one before it", () => {
    const sections = [section(1, [entry("a", ul(li("b1"), li("b2", true), li("b3", true), li("b4")))])];
    expect(leftOutRuns(sections)).toEqual([
      {
        after: { sectionId: 1, kind: "item", entryId: "a", itemId: "b1" },
        sectionId: 1,
        items: [
          { sectionId: 1, entryId: "a", itemId: "b2", label: "Text b2" },
          { sectionId: 1, entryId: "a", itemId: "b3", label: "Text b3" },
        ],
      },
    ]);
  });

  it("folds a left-out entry after the shown entry before it, as one item named by its title", () => {
    const sections = [section(1, [entry("a"), entry("b", ul(li("x"), li("y")), { hidden: true }), entry("c")])];
    expect(leftOutRuns(sections)).toEqual([
      { after: { sectionId: 1, kind: "entry", entryId: "a" }, sectionId: 1, items: [{ sectionId: 1, entryId: "b", label: "Entry b" }] },
    ]);
  });

  it("folds a left-out section after the section before it", () => {
    const sections = [section(1, [entry("a")]), section(2, [entry("b")], { hidden: true }), section(3, [entry("c")])];
    expect(leftOutRuns(sections)).toEqual([
      { after: { sectionId: 1, kind: "heading" }, sectionId: 2, items: [{ sectionId: 2, label: "Section 2" }] },
    ]);
  });

  it("ties a left-out section to the one before it in its own column", () => {
    const sections = [
      section(1, [entry("a")]),
      section(2, [entry("b")], { placement: "sidebar" }),
      section(3, [entry("c")], { hidden: true }),
    ];
    expect(leftOutRuns(sections, true).map(({ after }) => after)).toEqual([{ sectionId: 1, kind: "heading" }]);
    expect(leftOutRuns(sections).map(({ after }) => after)).toEqual([{ sectionId: 2, kind: "heading" }]);
  });

  it("doesn't count a blank left-out item", () => {
    const sections = [section(1, [entry("a", ul(li("b1"), li("b2", true, ""), li("b3")))])];
    expect(leftOutRuns(sections)).toEqual([]);
  });

  it("folds a left-out summary after the title line, with the bullets left out after it", () => {
    const sections = [section(1, [entry("a", ul(li("b1", true), li("b2")), { description: "Led it", description_off: true })])];
    expect(leftOutRuns(sections)).toEqual([
      {
        after: { sectionId: 1, kind: "entry", entryId: "a" },
        sectionId: 1,
        items: [
          { sectionId: 1, entryId: "a", itemId: SUMMARY_ID, label: "Summary" },
          { sectionId: 1, entryId: "a", itemId: "b1", label: "Text b1" },
        ],
      },
    ]);
  });

  it("folds left-out entries at the top of their section after nothing", () => {
    const sections = [section(1, [entry("a", "", { hidden: true }), entry("b")])];
    expect(leftOutRuns(sections)[0].after).toBeNull();
  });

  it("leaves blank entries and blank sections unfolded", () => {
    const blank = { ...emptyEntry(), id: "z", hidden: true };
    const sections = [section(1, [entry("a"), blank]), section(2, [], { hidden: true, section_type: "" })];
    expect(leftOutRuns(sections)).toEqual([]);
  });
});

describe("findFolds", () => {
  const boxes = new Map<Element, { top: number; bottom: number }>();

  /** A page of `html`, with each selector's box; anything not given has none: it didn't print. */
  const sheet = (html: string, rects: [string, number, number][]) => {
    document.body.innerHTML = `<div id="root">${html}</div>`;
    const root = document.getElementById("root")!;
    boxes.set(root, { top: 0, bottom: 3000 });
    rects.forEach(([selector, top, bottom]) => boxes.set(root.querySelector(selector)!, { top, bottom }));
    return root;
  };
  const shownLi = (id: string) => `<li data-cv-item="${id}">${id}</li>`;

  beforeEach(() => {
    // jsdom has none.
    vi.stubGlobal("CSS", { escape: (id: string) => id });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const { top = 0, bottom = 0 } = boxes.get(this) ?? {};
      return { top, bottom, left: 0, right: 600, height: bottom - top, width: 600, x: 0, y: top } as DOMRect;
    });
  });

  afterEach(() => {
    boxes.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("puts a fold at its gap's y, in sheet units", () => {
    const root = sheet(
      `<div class="resume-classic"><section data-section-id="1"><div data-entry-id="a">
        <div class="rc-section-head"><h3 class="rc-title">Entry a</h3></div>
        <div class="rc-body"><ul>${shownLi("b1")}${shownLi("b4")}</ul></div>
      </div></section></div>`,
      [
        ['[data-cv-item="b1"]', 200, 210],
        ['[data-cv-item="b4"]', 214, 224],
      ]
    );
    const sections = [section(1, [entry("a", ul(li("b1"), li("b2", true), li("b3", true), li("b4")))])];
    const [fold] = findFolds(root, 0.5, sections);
    expect(fold.top).toBe(424);
    expect(fold.side).toBe("left");
    expect(fold.items).toHaveLength(2);
    expect(fold.line.top).toBe(424);
  });

  it("puts a left-out entry between the entries on either side", () => {
    const root = sheet(
      `<div class="resume-classic"><section data-section-id="1">
        <div data-entry-id="a"><div class="rc-section-head"><h2 class="rc-heading">S</h2><h3 class="rc-title">A</h3></div>
          <div class="rc-body"><ul>${shownLi("x")}</ul></div></div>
        <div data-entry-id="c"><div class="rc-section-head"><h3 class="rc-title">C</h3><div class="rc-entry-line">Role</div></div></div>
      </section></div>`,
      [
        ['[data-cv-item="x"]', 100, 110],
        ['[data-entry-id="c"] .rc-title', 116, 126],
        ['[data-entry-id="c"] .rc-entry-line', 128, 138],
      ]
    );
    const sections = [section(1, [entry("a", ul(li("x"))), entry("b", "", { hidden: true }), entry("c")])];
    expect(findFolds(root, 1, sections).map(({ top }) => top)).toEqual([113]);
  });

  it("puts a left-out first entry between the heading and the next title line, not over the heading", () => {
    const root = sheet(
      `<div class="resume-classic"><section data-section-id="1"><div data-entry-id="b">
        <div class="rc-section-head"><h2 class="rc-heading">S</h2><h3 class="rc-title">B</h3><div class="rc-entry-line">Role</div></div>
      </div></section></div>`,
      [
        [".rc-heading", 50, 60],
        [".rc-title", 70, 80],
        [".rc-entry-line", 82, 92],
      ]
    );
    const sections = [section(1, [entry("a", "", { hidden: true }), entry("b")])];
    expect(findFolds(root, 1, sections).map(({ top }) => top)).toEqual([65]);
  });

  it("puts a left-out section between the sections on either side", () => {
    const root = sheet(
      `<div class="resume-classic">
        <section data-section-id="1"><div data-entry-id="a"><div class="rc-section-head"><h2 class="rc-heading">One</h2></div>
          <div class="rc-body"><ul>${shownLi("x")}</ul></div></div></section>
        <section data-section-id="3"><div data-entry-id="c"><div class="rc-section-head"><h2 class="rc-heading">Three</h2></div></div></section>
      </div>`,
      [
        ['[data-cv-item="x"]', 100, 110],
        ['[data-section-id="3"] .rc-heading', 126, 136],
      ]
    );
    const sections = [section(1, [entry("a", ul(li("x")))]), section(2, [entry("b")], { hidden: true }), section(3, [entry("c")])];
    expect(findFolds(root, 1, sections).map(({ top }) => top)).toEqual([118]);
  });

  it("keeps a fold across a page break by the block above it", () => {
    const root = sheet(
      `<div class="resume-classic"><section data-section-id="1"><div data-entry-id="a">
        <div class="rc-body"><ul>${shownLi("b1")}${shownLi("b3")}</ul></div>
      </div></section></div>`,
      [
        ['[data-cv-item="b1"]', 190, 200],
        ['[data-cv-item="b3"]', 300, 310],
      ]
    );
    const sections = [section(1, [entry("a", ul(li("b1"), li("b2", true), li("b3")))])];
    expect(findFolds(root, 1, sections).map(({ top }) => top)).toEqual([200 + MARK_SIZE / 2]);
  });

  it("finds a place by what did print when what it follows didn't", () => {
    // Entry a prints nothing: its title is empty and its summary is left out.
    const root = sheet(
      `<div class="resume-classic"><section data-section-id="1">
        <div data-entry-id="x"><div class="rc-body"><ul>${shownLi("x1")}</ul></div></div>
      </section></div>`,
      [['[data-cv-item="x1"]', 100, 110]]
    );
    const sections = [
      section(1, [entry("x", ul(li("x1"))), entry("a", "", { title: "", description: "Led it", description_off: true })]),
    ];
    const folds = findFolds(root, 1, sections);
    expect(folds.map(({ top, items }) => [top, items.map(({ label }) => label)])).toEqual([[110, ["Summary"]]]);
  });

  it("puts a section run at the top of its column after the header", () => {
    const root = sheet(
      `<div class="resume-classic"><header class="rc-header">Name</header>
        <section data-section-id="2"><div data-entry-id="b"><div class="rc-section-head"><h2 class="rc-heading">Two</h2></div></div></section>
      </div>`,
      [
        [".rc-header", 0, 60],
        [".rc-heading", 66, 76],
      ]
    );
    const sections = [section(1, [entry("a")], { hidden: true }), section(2, [entry("b")])];
    expect(findFolds(root, 1, sections).map(({ top }) => top)).toEqual([63]);
  });

  it("keeps each column's folds in that column, with nothing shown there", () => {
    const root = sheet(
      `<div class="resume-classic resume-sidebar">
        <aside class="rs-side"><header class="rc-header">Name</header></aside>
        <div class="rs-main"><section data-section-id="1"><div data-entry-id="a">
          <div class="rc-section-head"><h2 class="rc-heading">One</h2></div></div></section></div>
      </div>`,
      [
        [".rs-side", 0, 1000],
        [".rc-header", 20, 80],
        [".rs-main", 30, 1000],
      ]
    );
    // Neither prints: the side column has only its header, and section 1 has nothing that shows.
    const sections = [
      section(1, [entry("a")]),
      section(2, [entry("b")], { hidden: true }),
      section(3, [entry("c")], { hidden: true, placement: "sidebar" }),
    ];
    const folds = findFolds(root, 1, sections);
    expect(folds.map(({ top, side, items }) => [items[0].sectionId, top, side]).sort()).toEqual([
      [2, 30, "right"],
      [3, 80, "left"],
    ]);
  });
});
