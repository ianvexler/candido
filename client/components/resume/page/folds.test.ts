import { emptyEntry } from "@/lib/resume/sectionEntries";
import { CurriculumSection, SectionEntry, SUMMARY_ID } from "@/lib/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findFolds, leftOutRuns } from "./folds";

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
  const boxes = new Map<Element, { top: number; bottom: number; left: number; right: number }>();
  const place = (element: Element | null, top: number, bottom: number, left = 0, right = 600) =>
    boxes.set(element!, { top, bottom, left, right });

  afterEach(() => {
    boxes.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("puts a fold at its gap's y, in sheet units, on its column's side", () => {
    // jsdom has none.
    vi.stubGlobal("CSS", { escape: (id: string) => id });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const { top = 0, bottom = 0, left = 0, right = 0 } = boxes.get(this) ?? {};
      return { top, bottom, left, right, height: bottom - top, width: right - left, x: left, y: top } as DOMRect;
    });
    document.body.innerHTML = `
      <div id="root"><div class="resume-classic">
        <section data-section-id="1"><div data-entry-id="a">
          <div data-block="head"><h3>Entry a</h3></div>
          <div class="rc-body"><ul><li data-cv-item="b1">One</li><li data-cv-item="b4">Four</li></ul></div>
        </div></section>
      </div></div>`;
    const root = document.getElementById("root")!;
    place(root, 100, 900);
    place(root.querySelector(".resume-classic"), 100, 900, 10, 610);
    place(root.querySelector('[data-cv-item="b1"]'), 200, 210);
    place(root.querySelector('[data-cv-item="b4"]'), 214, 224);
    const sections = [section(1, [entry("a", ul(li("b1"), li("b2", true), li("b3", true), li("b4")))])];

    const [fold] = findFolds(root, 0.5, sections);
    expect(fold.top).toBe(224);
    expect(fold.side).toBe("left");
    expect(fold.items).toHaveLength(2);
    expect(fold.line.top).toBe(224);
  });
});
