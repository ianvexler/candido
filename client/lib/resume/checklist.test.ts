import { afterEach, describe, expect, it, vi } from "vitest";
import { CurriculumSection, CvSuggestion, ResumeHeader, ResumeHeaderTextFields, SectionEntry, SectionTemplate } from "@/lib/types";
import {
  addEntry,
  buildChecklist,
  entryOffer,
  filterChecklist,
  insertEntry,
  itemOffer,
  moveSection,
  placeSection,
  putBack,
  showForBullet,
  suggestionPlace,
  tickEntry,
  tickItem,
  tickSection,
  tickSuggestion,
} from "./checklist";
import { buildResumeDocument } from "./exportDocument";
import { listItems } from "./items";
import { emptyEntry } from "./sectionEntries";
import type { SectionDraft } from "./sectionDrafts";

const emptyHeader = { links: [], ...Object.fromEntries(ResumeHeaderTextFields.map((field) => [field, ""])) } as unknown as ResumeHeader;

const MADE = "2026-11-01T00:00:00.000Z";
const BEFORE = "2026-10-01T00:00:00.000Z";
const AFTER = "2026-11-02T00:00:00.000Z";

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

const cv = (entries: SectionEntry[], changes: Partial<CurriculumSection> = {}) =>
  ({
    id: 1,
    section_type: "Experience",
    section_template_id: null,
    hidden: false,
    placement: null,
    base_items: {},
    base_fields: {},
    entries,
    ...changes,
  }) as CurriculumSection;

const library = (entries: SectionEntry[], changes: Partial<SectionTemplate> = {}) =>
  ({ id: 10, section_type: "Experience", item_added_at: {}, entries, ...changes }) as SectionTemplate;

const build = (sections: CurriculumSection[], templates: SectionTemplate[] = []) =>
  buildChecklist(sections, templates, MADE);
const first = (sections: CurriculumSection[], templates: SectionTemplate[] = []) => build(sections, templates)[0];

const ids = (list: { id: string }[]) => list.map(({ id }) => id).join("");
/** Entries with their ticks, capital when ticked: "A(x-)" has item x ticked and one not. */
const ticks = (section: SectionDraft) =>
  section.entries
    .map(({ id, hidden, content }) => {
      const items = listItems(content).map((item) => (item.off ? "-" : item.id));
      return `${section.hidden || hidden ? id : id.toUpperCase()}(${items.join("")})`;
    })
    .join(" ");
const apply = (section: CurriculumSection, patch: object) => ({ ...section, ...patch }) as CurriculumSection;

const counts = ({ included, total, state, ticked }: { included: number; total: number; state: string; ticked: boolean }) =>
  [included, total, state, ticked];

describe("buildChecklist counts", () => {
  it("counts ticked items", () => {
    const section = first([cv([entry("a", ul(li("x"), li("y", true))), entry("b", ul(li("z")))])]);
    expect(counts(section)).toEqual([2, 3, "partial", true]);
    expect(section.entries.map(counts)).toEqual([[1, 2, "partial", true], [1, 1, "on", true]]);
    expect(section.entries[0].items.map(({ off, ticked }) => [off, ticked])).toEqual([[false, true], [true, false]]);
  });

  it("counts everything in a hidden entry as left out, keeping its ticks", () => {
    const section = first([cv([entry("a", ul(li("x")), { hidden: true }), entry("b", ul(li("z")))])]);
    expect(counts(section)).toEqual([1, 2, "partial", true]);
    expect(counts(section.entries[0])).toEqual([0, 1, "off", false]);
    expect(section.entries[0].items[0]).toMatchObject({ off: false, ticked: false });
  });

  it("counts nothing in a hidden section", () => {
    const section = first([cv([entry("a", ul(li("x")))], { hidden: true })]);
    expect(counts(section)).toEqual([0, 1, "off", false]);
    expect(section.entries[0]).toMatchObject({ hidden: false, ticked: false, state: "off" });
    expect(section.entries[0].items[0].ticked).toBe(false);
  });

  it("counts 0 with the only entry hidden", () =>
    expect(counts(first([cv([entry("a", ul(li("x")), { hidden: true })])]))).toEqual([0, 1, "off", false]));

  it("counts an entry without items as one", () => {
    const section = first([cv([entry("a"), entry("b", "<p></p>", { hidden: true })])]);
    expect(counts(section)).toEqual([1, 2, "partial", true]);
    expect(section.entries.map(counts)).toEqual([[1, 1, "on", true], [0, 1, "off", false]]);
  });

  it("keeps an entry with every item off partly ticked", () => {
    const section = first([cv([entry("a", ul(li("x", true)))])]);
    expect(counts(section.entries[0])).toEqual([0, 1, "partial", true]);
    expect(counts(section)).toEqual([0, 1, "partial", true]);
  });

  it("is fully on when everything is", () =>
    expect(counts(first([cv([entry("a", ul(li("x"))), entry("b")])]))).toEqual([2, 2, "on", true]));
});

describe("blank entries", () => {
  const blank = (id: string, changes = {}) => entry(id, "<p></p>", { title: "", ...changes });

  it("count for nothing", () => {
    const section = first([cv([entry("a", ul(li("x"))), blank("b", { hidden: true }), blank("c")])]);
    expect(counts(section)).toEqual([1, 1, "on", true]);
    expect(section.entries.slice(1).map(counts)).toEqual([[0, 0, "off", false], [0, 0, "on", true]]);
  });

  it("aren't ticked content of a section", () =>
    expect(counts(first([cv([entry("a", ul(li("x")), { hidden: true }), blank("b")])]))).toEqual([0, 1, "off", false]));

  it("leave a section of only them its own tick", () => {
    expect(counts(first([cv([blank("a", { hidden: true })])]))).toEqual([0, 0, "on", true]);
    expect(counts(first([cv([blank("a")], { hidden: true })]))).toEqual([0, 0, "off", false]);
  });

  it("count library items they lack", () => {
    const section = first([cv([blank("a")], { section_template_id: 10 })], [library([entry("a", ul(li("x")))])]);
    expect(counts(section)).toEqual([0, 1, "partial", true]);
  });

  it("count for nothing in the library", () =>
    expect(counts(first([], [library([blank("a"), entry("b")])]))).toEqual([0, 1, "off", false]));

  it("aren't earlier ticks of a section", () => {
    const section = cv([entry("a", ul(li("x")), { hidden: true }), blank("b")], { hidden: true });
    expect(ticks(apply(section, tickSection(section, true)))).toBe("A(x) B()");
  });
});

describe("buildChecklist rows", () => {
  it("lists CV-only sections, and library sections in no CV section once, last", () => {
    const list = build(
      [cv([entry("a")], { id: 1 }), cv([entry("b")], { id: 2, section_template_id: 10 })],
      [library([entry("c", ul(li("x")))], { id: 11, section_type: "Awards" }), library([entry("b")])]
    );
    expect(list.map(({ sectionId, templateId, name }) => [sectionId, templateId, name])).toEqual([
      [1, null, "Experience"],
      [2, 10, "Experience"],
      [null, 11, "Awards"],
    ]);
    expect(new Set(list.map(({ key }) => key)).size).toBe(3);
    expect(counts(list[2])).toEqual([0, 1, "off", false]);
    expect(list[2].entries[0]).toMatchObject({ inCv: false, ticked: false, fieldsState: "library_only" });
    expect(list[2].entries[0].items[0]).toMatchObject({ inCv: false, ticked: false, state: "library_only" });
  });

  it("lists library content after its nearest earlier neighbour", () => {
    const section = first(
      [cv([entry("a", ul(li("x"), li("m"))), entry("n"), entry("d")], { section_template_id: 10 })],
      [library([entry("z"), entry("a", ul(li("w"), li("x"), li("y"))), entry("b"), entry("c"), entry("d")])]
    );
    expect(ids(section.entries)).toBe("zabcnd");
    expect(ids(section.entries[1].items)).toBe("wxym");
    expect(section.entries[1].items.map(({ inCv }) => inCv)).toEqual([false, true, false, true]);
    expect(counts(section)).toEqual([4, 9, "partial", true]);
  });

  it("has what an item with hidden text shows", () => {
    const section = first([cv([entry("a", ul(li("x", false, 'A <span data-cv-hidden="true">B</span>'), li("y")))])]);
    expect(section.entries[0].items.map(({ shownText }) => shownText)).toEqual(["A", null]);
  });

  it("looks items up across the whole library section", () => {
    const section = first(
      [cv([entry("a", ul(li("x"), li("y"))), entry("b")], { section_template_id: 10 })],
      [library([entry("a", ul(li("x"))), entry("b"), entry("c", ul(li("y"), li("z")))])]
    );
    expect(section.entries.map(({ items }) => ids(items))).toEqual(["xy", "", "z"]);
    expect(section.entries[0].items[1]).toMatchObject({ inCv: true, state: "same" });
  });

  it("lists library-only content under the first copy only", () => {
    const list = build(
      [cv([entry("a")], { id: 5, section_template_id: 10 }), cv([entry("a")], { id: 2, section_template_id: 10 })],
      [library([entry("a", ul(li("x"))), entry("b")])]
    );
    expect(list.map(({ sectionId, entries }) => [sectionId, ids(entries), ids(entries[0].items)])).toEqual([
      [5, "ab", "x"],
      [2, "a", ""],
    ]);
  });

  it("doesn't list what a later copy holds", () => {
    const list = build(
      [
        cv([entry("a", ul(li("x")))], { id: 1, section_template_id: 10 }),
        cv([entry("a", ul(li("y"))), entry("b", ul(li("z")))], { id: 2, section_template_id: 10 }),
      ],
      [library([entry("a", ul(li("x"), li("y"), li("w"))), entry("b", ul(li("z"))), entry("c")])]
    );
    expect(list.map(({ entries }) => entries.map((e) => e.id + ids(e.items)))).toEqual([["axw", "c"], ["ay", "bz"]]);
  });

  it("lists what another library section's copy holds", () => {
    const section = first(
      [cv([entry("a")], { section_template_id: 10 }), cv([entry("b")], { id: 2, section_template_id: 11 })],
      [library([entry("a"), entry("b")]), library([], { id: 11 })]
    );
    expect(ids(section.entries)).toBe("ab");
  });

  it("gives what isn't in the library as cv_only", () => {
    const section = first([cv([entry("a", ul(li("x")))], { section_template_id: 10 })], [library([])]);
    expect(section.entries[0]).toMatchObject({ inCv: true, fieldsState: "cv_only" });
    expect(section.entries[0].items[0]).toMatchObject({ inCv: true, state: "cv_only" });
    expect(first([cv([entry("a")], { section_template_id: 99 })]).entries[0].fieldsState).toBe("cv_only");
  });

  it("compares items and fields with the library and their base", () => {
    const section = cv([entry("a", ul(li("x", true, "New"), li("y")), { role: "Lead" })], {
      section_template_id: 10,
      base_items: { x: li("x"), y: li("y") },
      base_fields: { a: entry("a") },
    });
    const built = first([section], [library([entry("a", ul(li("x"), li("y", false, "Other")))])]);
    expect(built.entries[0].fieldsState).toBe("cv_changed");
    expect(built.entries[0].items.map(({ state }) => state)).toEqual(["cv_changed", "library_changed"]);
  });

  it("never lists blank items", () =>
    expect(ids(first([cv([entry("a", ul(li("x", false, " "), li("y")) + '<p data-cv-item="z"></p>')])]).entries[0].items)).toBe("y"));

  it("titles a CV entry by its own items before the library's", () => {
    const built = (content: string) =>
      first(
        [cv([entry("a", content, { title: "" })], { section_template_id: 10 })],
        [library([entry("a", ul(li("x"), li("y")), { title: "" })])]
      ).entries[0].title;
    expect(built(ul(li("y")))).toBe("Text y");
    expect(built("")).toBe("Text x");
  });

  it("titles entries by what they have", () => {
    const blank = { title: " " };
    const section = first([
      cv([
        entry("a"),
        entry("b", "", { ...blank, organization: "Acme", role: "Lead" }),
        entry("c", ul(li("x")), { ...blank, role: "Lead" }),
        entry("d", ul(li("y")), blank),
        entry("e", "", blank),
      ]),
    ]);
    expect(section.entries.map(({ title }) => title)).toEqual(["Entry a", "Acme", "Lead", "Text y", "Untitled"]);
  });
});

describe("buildChecklist new", () => {
  const added = { item_added_at: { a: AFTER, b: AFTER, c: BEFORE, d: MADE, x: AFTER, y: BEFORE } };
  const entries = ["a", "b", "c", "d", "e"].map((id) => entry(id, id === "a" ? ul(li("x"), li("y"), li("w")) : ""));

  it("marks library content added after the CV was made", () => {
    const section = first(
      [cv([entry("a", ul(li("y")))], { section_template_id: 10 })],
      [library(entries, added)]
    );
    expect(section.entries.map(({ isNew }) => isNew)).toEqual([false, true, false, false, false]);
    expect(section.entries[0].items.map(({ id, isNew }) => [id, isNew])).toEqual([["x", true], ["y", false], ["w", false]]);
    expect(section.isNew).toBe(false);
  });

  it("marks a section whose entries are all new", () => {
    expect(first([], [library(entries.slice(0, 2), added)]).isNew).toBe(true);
    expect(first([], [library(entries, added)]).isNew).toBe(false);
  });

  it("takes a Date too", () =>
    expect(buildChecklist([], [library(entries.slice(0, 2), added)], new Date(MADE))[0].isNew).toBe(true));
});

it("builds again without parsing", () => {
  const spy = vi.spyOn(document.implementation, "createHTMLDocument");
  const make = () => {
    const section = cv([entry("a", ul(li("p1", false, "Cached"), li("p2")))], {
      section_template_id: 10,
      base_items: { p1: li("p1", false, "Base") },
    });
    return build([section], [library([entry("a", ul(li("p1", false, "Library"), li("p2")))])]);
  };
  const built = make();
  expect(spy).toHaveBeenCalled();
  spy.mockClear();
  expect(make()).toEqual(built);
  expect(spy).not.toHaveBeenCalled();
});

afterEach(() => vi.restoreAllMocks());

describe("tickEntry", () => {
  const section = cv([entry("a", ul(li("x"), li("y", true))), entry("b", ul(li("z", true)))]);

  it("restores item ticks", () => {
    const off = apply(section, tickEntry(section, "a", false));
    expect(ticks(off)).toBe("a(x-) B(-)");
    expect(ticks(apply(off, tickEntry(off, "a", true)))).toBe("A(x-) B(-)");
  });

  it("ticks all items when none were ticked", () => {
    const off = apply(section, tickEntry(section, "b", false));
    expect(ticks(apply(off, tickEntry(off, "b", true)))).toBe("A(x-) B(z)");
  });

  it("shows only that entry of a hidden section", () =>
    expect(ticks(apply({ ...section, hidden: true }, tickEntry({ ...section, hidden: true }, "a", true)))).toBe("A(x-) b(-)"));

  it("hides the only entry", () => {
    const only = cv([entry("a")]);
    expect(tickEntry(only, "a", false)).toEqual({ entries: [{ ...only.entries[0], hidden: true }] });
  });

  it("changes nothing for an entry the CV lacks", () => {
    expect(tickEntry({ ...section, hidden: true }, "q", true)).toEqual({});
    expect(tickEntry(section, "q", false)).toEqual({});
  });

  describe("with a purpose", () => {
    const allOff = cv([entry("a", ul(li("x", true), li("y", true), li("z", true)), { hidden: true })]);

    it("ticks only the items that fit", () =>
      expect(ticks(apply(allOff, tickEntry(allOff, "a", true, (_, item) => item === "y")))).toBe("A(-y-)"));

    it("ticks all when none fit", () =>
      expect(ticks(apply(allOff, tickEntry(allOff, "a", true, () => false)))).toBe("A(xyz)"));

    it("restores earlier ticks whatever fits", () => {
      const off = apply(section, tickEntry(section, "a", false));
      expect(ticks(apply(off, tickEntry(off, "a", true, (_, item) => item === "y")))).toBe("A(x-) B(-)");
    });

    it("ticks the summary of an entry that fits, if it fits too", () => {
      const summarised = cv([entry("a", ul(li("x", true), li("y", true)), { hidden: true, description: "About", description_off: true })]);
      const ticked = (summaryFits: boolean) =>
        apply(summarised, tickEntry(summarised, "a", true, (_, item) => item === "x" || (summaryFits && item === "$summary")));
      expect(ticks(ticked(true))).toBe("A(x-)");
      expect(ticked(true).entries[0].description_off).toBe(false);
      expect(ticked(false).entries[0].description_off).toBe(true);
    });

    // An unlabelled entry whose items are for another purpose: its summary fits, the entry doesn't.
    const otherPurpose = (_: string, item: string) => item === "$summary" || item === "";

    it("doesn't count the summary towards an entry's fit", () => {
      const summarised = cv([entry("a", ul(li("x", true), li("y", true)), { hidden: true, description: "About", description_off: true })]);
      const ticked = apply(summarised, tickEntry(summarised, "a", true, otherPurpose));
      expect(ticks(ticked)).toBe("A(xy)");
      expect(ticked.entries[0].description_off).toBe(false);
    });

    it("leaves such an entry out of a section where something else fits", () => {
      const section = cv(
        [
          entry("a", ul(li("x", true), li("y", true)), { hidden: true, description: "About", description_off: true }),
          entry("b", ul(li("z", true)), { hidden: true }),
        ],
        { hidden: true }
      );
      const fits = (entryId: string, item: string) => otherPurpose(entryId, item) || item === "z";
      expect(ticks(apply(section, tickSection(section, true, fits)))).toBe("a(--) B(z)");
    });
  });
});

describe("tickItem", () => {
  const section = cv([entry("a", ul(li("x"), li("y", true))), entry("b", ul(li("z")))]);

  it("leaves the entry ticked without its last item", () => {
    const off = apply(section, tickItem(section, "b", "z", false));
    expect(ticks(off)).toBe("A(x-) B(-)");
    expect(off.entries[1].hidden).toBe(false);
  });

  describe("with the last item of an entry without fields", () => {
    const bare = (id: string, content: string, changes = {}) => entry(id, content, { title: "", ...changes });
    const exported = (changed: CurriculumSection) =>
      buildResumeDocument({ title: "", header: emptyHeader, sections: [changed] }).sections;

    it("leaves the entry out", () => {
      const before = cv([bare("a", ul(li("x"), li("y"))), section.entries[1]]);
      const one = apply(before, tickItem(before, "a", "x", false));
      expect(ticks(one)).toBe("A(-y) B(z)");
      expect(ticks(apply(one, tickItem(one, "a", "y", false)))).toBe("a(--) B(z)");
    });

    it("exports nothing when nothing written is left, and shows only the item ticked again", () => {
      const before = cv([bare("a", ul(li("x"), li("y", true))), bare("n", ""), entry("h", ul(li("w")), { hidden: true })]);
      expect(exported(before)).toHaveLength(1);
      const off = apply(before, tickItem(before, "a", "x", false));
      expect(exported(off)).toEqual([]);
      expect(buildChecklist([off], [], MADE)[0].state).toBe("off");

      const on = apply(off, tickItem(off, "a", "y", true));
      expect(on.entries.map(({ hidden }) => hidden).slice(0, 1)).toEqual([false]);
      expect(ticks(on)).toBe("A(-y) n() h(w)");
      expect(exported(on)).toHaveLength(1);
      expect(ticks(apply(off, tickEntry(off, "a", true)))).toBe("A(xy) n() h(w)");
    });

    it("doesn't hide the section while another entry shows", () => {
      const before = cv([bare("a", ul(li("x"))), bare("b", ul(li("z", true)))]);
      expect(apply(before, tickItem(before, "a", "x", false)).hidden).toBe(false);
    });

    it("leaves one with a field", () => {
      const before = cv([bare("a", ul(li("x")), { start_date: "2020-01-01" })]);
      expect(ticks(apply(before, tickItem(before, "a", "x", false)))).toBe("A(-)");
    });
  });

  it("leaves what is ticked alone", () =>
    expect(ticks(apply(section, tickItem(section, "a", "y", true)))).toBe("A(xy) B(z)"));

  it.each([
    ["a hidden entry", false, true, "A(-y) B(z)"],
    ["a hidden section", true, false, "A(-y) b(z)"],
    ["both", true, true, "A(-y) b(z)"],
  ])("shows only that item of %s", (_, hidden, entryHidden, expected) => {
    const before = cv([{ ...section.entries[0], hidden: entryHidden }, section.entries[1]], { hidden });
    expect(ticks(apply(before, tickItem(before, "a", "y", true)))).toBe(expected);
  });

  it("changes nothing for an item the entry lacks", () => {
    const hidden = { ...section, hidden: true };
    expect(tickItem(hidden, "a", "z", true)).toEqual({});
    expect(tickItem(hidden, "q", "z", true)).toEqual({});
    expect(tickItem(hidden, "a", "", true)).toEqual({});
  });
});

describe("tickSection", () => {
  it("restores earlier ticks", () => {
    const section = cv([entry("a", ul(li("x"), li("y", true))), entry("b", "", { hidden: true }), entry("c", ul(li("z", true)))]);
    const off = apply(section, tickSection(section, false));
    expect(off.hidden).toBe(true);
    expect(ticks(apply(off, tickSection(off, true)))).toBe("A(x-) b() C(-)");
  });

  it("shows all when every entry is hidden", () => {
    const section = cv([entry("a", ul(li("x"), li("y", true)), { hidden: true }), entry("b", ul(li("z", true)), { hidden: true })]);
    expect(ticks(apply(section, tickSection(section, true)))).toBe("A(x-) B(z)");
  });

  it("ticks all items of untitled entries when none were ticked", () => {
    const section = cv([entry("a", ul(li("x", true), li("y", true)), { title: "" })], { hidden: true });
    expect(ticks(apply(section, tickSection(section, true)))).toBe("A(xy)");
  });

  it("keeps title lines on their own", () => {
    const section = cv([entry("a", ul(li("x", true)))], { hidden: true });
    expect(ticks(apply(section, tickSection(section, true)))).toBe("A(-)");
  });

  describe("with a purpose", () => {
    const section = cv(
      [
        entry("a", ul(li("x", true), li("y", true)), { hidden: true }),
        entry("b", ul(li("z", true)), { hidden: true }),
        entry("c", "", { hidden: true }),
      ],
      { hidden: true }
    );
    const fits = (entryId: string, item: string) => item === "y" || (entryId === "c" && item === "");

    it("ticks what fits and leaves out entries where nothing does", () =>
      expect(ticks(apply(section, tickSection(section, true, fits)))).toBe("A(-y) b(-) C()"));

    it("ticks all when nothing fits", () =>
      expect(ticks(apply(section, tickSection(section, true, () => false)))).toBe("A(xy) B(z) C()"));

    it("restores earlier ticks whatever fits", () => {
      const ticked = cv([entry("a", ul(li("x"), li("y", true))), entry("b", ul(li("z", true)))], { hidden: true });
      expect(ticks(apply(ticked, tickSection(ticked, true, fits)))).toBe("A(x-) B(-)");
    });
  });
});

describe("placeSection", () => {
  it("puts a section after another", () => expect(placeSection([1, 2, 3, 4], 4, 1)).toEqual([1, 4, 2, 3]));
  it("puts it first for null", () => expect(placeSection([1, 2, 3], 3, null)).toEqual([3, 1, 2]));
  it("has nothing to do when the other is gone", () => expect(placeSection([1, 2, 3], 3, 9)).toBeNull());
  it("has nothing to do when it is there already", () => {
    expect(placeSection([1, 2, 3], 2, 1)).toBeNull();
    expect(placeSection([1, 2, 3], 1, null)).toBeNull();
  });
});

it("moveSection swaps with a neighbour and keeps every id", () => {
  expect(moveSection([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
  expect(moveSection([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  expect(moveSection([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  expect(moveSection([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
});

describe("filterChecklist", () => {
  const list = build([
    cv([entry("a", ul(li("x", false, "Rails"), li("y"))), entry("b", ul(li("z", false, "Ruby")))]),
    cv([entry("c", ul(li("w")))], { id: 2, section_type: "Awards" }),
  ]);
  const shape = (query: string) =>
    filterChecklist(list, query).map(({ sectionId, entries }) => [sectionId, ...entries.map((e) => e.id + ids(e.items))]);

  it("keeps the parents of what matches", () => expect(shape(" RAILS ")).toEqual([[1, "ax"]]));
  it("keeps what is in a matching entry or section", () => {
    expect(shape("entry a")).toEqual([[1, "axy"]]);
    expect(shape("award")).toEqual([[2, "cw"]]);
  });
  it("finds several", () => expect(shape("text")).toEqual([[1, "ay"], [2, "cw"]]));
  it("keeps counts", () => expect(filterChecklist(list, "rails")[0].total).toBe(3));
  it("keeps all without a query", () => expect(filterChecklist(list, "  ")).toBe(list));
  it("keeps nothing without a match", () => expect(shape("nope")).toEqual([]));
});

describe("suggestionPlace", () => {
  const about = (quote: string, changes: Partial<CvSuggestion> = {}) =>
    ({ entry_id: "a", field: "content", quote, ...changes }) as CvSuggestion;
  const a = entry("a", ul(li("x", false, "Built  APIs"), li("y", true, "Ran tests")), { description: "A summary" });
  const b = entry("b", ul(li("z", false, "Other")));
  const section = cv([a, b]);

  it.each([
    ["Built APIs", {}, "visible"],
    ["Ran tests", {}, "left_out"],
    ["Gone", {}, "stale"],
    ["Other", {}, "stale"],
    ["Other", { entry_id: "b" }, "visible"],
    ["Built", { entry_id: "q" }, "stale"],
    ["Built", { entry_id: null, field: null }, "visible"],
    ["A summary", {}, "stale"],
    ["A summary", { field: "description" }, "visible"],
    ["Gone", { field: "description" }, "stale"],
  ] as const)("%s %j is %s", (quote, changes, place) =>
    expect(suggestionPlace(section, about(quote, changes))).toBe(place));

  it.each([
    ["entry", cv([{ ...a, hidden: true }, b])],
    ["section", cv([a, b], { hidden: true })],
  ])("is left out in a hidden %s, if the text is still there", (_, hidden) => {
    expect(suggestionPlace(hidden, about("Built"))).toBe("left_out");
    expect(suggestionPlace(hidden, about("Ran tests"))).toBe("left_out");
    expect(suggestionPlace(hidden, about("A summary", { field: "description" }))).toBe("left_out");
    expect(suggestionPlace(hidden, about("Gone"))).toBe("stale");
  });

  it("is visible in a ticked item even if an unticked one has the same text", () =>
    expect(suggestionPlace(cv([entry("a", ul(li("x", true, "Same"), li("y", false, "Same")))]), about("Same"))).toBe("visible"));

  it.each([
    ["Secret", "stale"],
    ["Before after", "stale"],
    ["Before", "visible"],
    ["bold part", "visible"],
    ["part line", "visible"],
    ["line Nested", "stale"],
    ["Nested", "visible"],
    ["Nested Deeper", "stale"],
  ] as const)("matches what the editor does: %s is %s", (quote, place) => {
    const item =
      '<li data-cv-item="x"><p>Before <span data-cv-hidden="true">Secret</span> after</p>' +
      "<p>A <strong>bold</strong> part<br>line</p><ul><li><p>Nested</p></li><li><p>Deeper</p></li></ul></li>";
    expect(suggestionPlace(cv([entry("a", ul(item))]), about(quote))).toBe(place);
  });

  it("is stale when only separate items together have the text", () =>
    expect(suggestionPlace(cv([entry("a", ul(li("x", false, "One"), li("y", false, "two")))]), about("One two"))).toBe("stale"));
});

describe("tickSuggestion", () => {
  const about = (quote: string, changes: Partial<CvSuggestion> = {}) =>
    ({ entry_id: "a", field: "content", quote, ...changes }) as CvSuggestion;
  const a = entry("a", ul(li("x", true, "Built APIs"), li("y", true, "Ran tests")), { description: "A summary" });
  const ticked = (section: CurriculumSection, suggestion: CvSuggestion) => ({
    ...section,
    ...tickSuggestion(section, suggestion),
  });

  it.each([
    ["an item", cv([a])],
    ["an item of a left out entry", cv([{ ...a, hidden: true }])],
    ["an item of a left out section", cv([a], { hidden: true })],
  ])("shows %s", (_, section) => {
    const suggestion = about("Ran tests");
    const next = ticked(section, suggestion);
    expect(suggestionPlace(next, suggestion)).toBe("visible");
    expect(listItems(next.entries[0].content).map(({ off }) => off)).toEqual([true, false]);
  });

  it("shows the entry of a summary", () => {
    const suggestion = about("A summary", { field: "description" });
    expect(suggestionPlace(ticked(cv([{ ...a, hidden: true }]), suggestion), suggestion)).toBe("visible");
  });

  it("changes nothing for text that is gone", () => expect(tickSuggestion(cv([a]), about("Gone"))).toEqual({}));
});

describe("what differs from the library", () => {
  it("gives the library's text of an item wherever it is in its section", () => {
    const section = first(
      [cv([entry("a", ul(li("x", false, "Mine")))], { section_template_id: 10 })],
      [library([entry("a"), entry("b", ul(li("x", false, "Theirs")))])]
    );
    expect(section.entries[0].items[0]).toMatchObject({ state: "differs", libraryText: "Theirs" });
  });

  it("lists the fields that differ, and marks blank entries", () => {
    const section = first(
      [cv([entry("a", "", { title: "Mine" }), entry("b", "", { title: "" })], { section_template_id: 10 })],
      [library([entry("a", "", { title: "Theirs" })])]
    );
    expect(section.entries[0]).toMatchObject({ blank: false, differences: [{ label: "Title", cv: "Mine", library: "Theirs" }] });
    expect(section.entries[1]).toMatchObject({ blank: true, differences: [] });
  });
});

describe("offers", () => {
  const offered = (sections: CurriculumSection[], templates: SectionTemplate[] = []) => {
    const section = first(sections, templates);
    return section.entries.map((row) => [entryOffer(row), ...row.items.map((item) => itemOffer(row, item))]);
  };

  it("offers a whole entry the library lacks once, not each item", () =>
    expect(offered([cv([entry("a", ul(li("x"), li("y")))])])).toEqual([["cv_only", null, null]]));

  it("offers an item in an entry the library has", () =>
    expect(
      offered(
        [cv([entry("a", ul(li("x"), li("y", false, "Other")))], { section_template_id: 10, base_items: { y: li("y") } })],
        [library([entry("a", ul(li("y")))])]
      )
    ).toEqual([[null, "cv_only", "cv_changed"]]));

  it("offers nothing on blank entries, or where only the library has it", () => {
    expect(offered([cv([entry("a", "", { title: "" })])])).toEqual([[null]]);
    expect(offered([cv([entry("a")], { section_template_id: 10 })], [library([entry("a", ul(li("x")))])])).toEqual([[null, null]]);
    expect(offered([], [library([entry("a", ul(li("x")))])])).toEqual([[null, null]]);
  });

  it("offers nothing on an item without an id", () =>
    expect(offered([cv([entry("a", "<p>x</p>")], { section_template_id: 10 })], [library([entry("a")])])).toEqual([[null, null]]));
});

describe("an entry's summary", () => {
  const SUM = "$summary";
  const own = (changes: Partial<SectionEntry> = {}) => entry("a", ul(li("x")), { description: "Sum", ...changes });
  const rows = (section: ReturnType<typeof first>) =>
    section.entries[0].items.map(({ id, inCv, ticked, state }) => [id, inCv, ticked, state]);
  const exported = (section: SectionDraft) =>
    buildResumeDocument({ title: "t", header: emptyHeader, sections: [{ ...section, id: 1 }] }).sections[0]?.entries[0];

  it("is its first item, and counts", () => {
    const section = first([cv([own()])]);
    expect(rows(section)).toEqual([[SUM, true, true, "cv_only"], ["x", true, true, "cv_only"]]);
    expect([section.included, section.total]).toEqual([2, 2]);
    const off = first([cv([own({ description_off: true })])]);
    expect([off.included, off.total, off.state]).toEqual([1, 2, "partial"]);
  });

  it("isn't an item when blank", () => expect(rows(first([cv([own({ description: "  " })])])).map(([id]) => id)).toEqual(["x"]));

  it("is listed when only the library has it", () => {
    const section = cv([own({ description: null })], { section_template_id: 10 });
    expect(rows(first([section], [library([own()])]))[0]).toEqual([SUM, false, false, "library_only"]);
  });

  it.each([
    ["same", "Sum", "Sum"],
    ["cv_changed", "Old", "Old"],
    ["library_changed", "New", "Sum"],
    ["both_changed", "New", "Old"],
    ["differs", "New", undefined],
  ])("is %s", (state, theirs, base) => {
    const fields: CurriculumSection["base_fields"] = base === undefined ? {} : { a: { description: base } };
    const section = cv([own()], { section_template_id: 10, base_fields: fields });
    const built = first([section], [library([own({ description: theirs })])]);
    expect(rows(built)[0][3]).toBe(state);
    expect(built.entries[0].fieldsState).toBe("same");
  });

  it("is offered from the library on the first copy only", () => {
    const without = own({ description: null });
    const copies = [cv([without], { id: 2, section_template_id: 10 }), cv([without], { id: 1, section_template_id: 10 })];
    expect(build(copies, [library([own()])]).flatMap(({ entries }) => ids(entries[0].items))).toEqual([`${SUM}x`, "x"]);
  });

  it("is added to the library with its entry, if that lacks it", () => {
    const { entries } = first([cv([own()])]);
    expect(itemOffer(entries[0], entries[0].items[0])).toBeNull();
    expect(entryOffer(entries[0])).toBe("cv_only");
  });

  it("is left out and back, with its text kept", () => {
    const section = cv([own()]);
    const left = { ...section, ...tickItem(section, "a", SUM, false) };
    expect(left.entries[0]).toMatchObject({ description: "Sum", description_off: true, hidden: false });
    expect(exported(left)).toMatchObject({ summary: "", title: "Entry a" });
    const back = { ...left, ...tickItem(left, "a", SUM, true) };
    expect(exported(back)?.summary).toBe("Sum");
  });

  it("shows alone in a left out entry", () => {
    const section = cv([own({ hidden: true })]);
    const [shown] = tickItem(section, "a", SUM, true).entries!;
    expect(shown).toMatchObject({ hidden: false, description_off: false });
    expect(listItems(shown.content)[0].off).toBe(true);
  });

  it("is unticked when another item shows alone", () => {
    const [shown] = tickItem(cv([own({ hidden: true })]), "a", "x", true).entries!;
    expect(shown.description_off).toBe(true);
  });

  it("comes back with an entry that had nothing ticked", () => {
    const section = cv([entry("a", ul(li("x", true)), { description: "Sum", description_off: true, hidden: true })]);
    expect(tickEntry(section, "a", true).entries![0].description_off).toBe(false);
  });

  it("as the last ticked thing of an untitled entry, leaves the entry out", () => {
    const section = cv([entry("a", ul(li("x", true)), { title: "", description: "Sum" })]);
    expect(tickItem(section, "a", SUM, false)).toMatchObject({ hidden: true, entries: [{ hidden: true }] });
  });

  it("left out, can be shown again for a suggestion", () => {
    const section = cv([own({ description_off: true })]);
    const suggestion = { entry_id: "a", field: "description", quote: "Sum" } as CvSuggestion;
    expect(suggestionPlace(section, suggestion)).toBe("left_out");
    expect(tickSuggestion(section, suggestion).entries![0].description_off).toBe(false);
  });
});

describe("adding", () => {
  const blank = { ...emptyEntry(), id: "n" };

  it("adds an entry after the CV's others", () => {
    const section = cv([entry("a", ul(li("x"))), entry("b", "", { hidden: true })]);
    expect(ticks(apply(section, addEntry(section, blank)))).toBe("A(x) b() N()");
  });

  it("shows only the new entry of a left out section", () => {
    const section = cv([entry("a", ul(li("x"))), entry("b")], { hidden: true });
    expect(ticks(apply(section, addEntry(section, blank)))).toBe("a(x) b() N()");
  });

  it("puts an entry after another, or first", () => {
    const section = cv([entry("a"), entry("b")]);
    const order = (afterId: string | null) => apply(section, insertEntry(section, afterId, blank)).entries.map(({ id }) => id);
    expect(order("a")).toEqual(["a", "n", "b"]);
    expect(order(null)).toEqual(["n", "a", "b"]);
  });

  it("shows only an entry put into a left out section", () => {
    const section = cv([entry("a", ul(li("x"))), entry("b")], { hidden: true });
    expect(ticks(apply(section, insertEntry(section, "a", blank)))).toBe("a(x) N() b()");
  });

  it("shows only the entry a bullet goes to, with none of its items", () => {
    const summary = { description: "Sums up" };
    const hidden = cv([entry("a", ul(li("x"), li("y", true)), summary), entry("b")], { hidden: true });
    const shown = apply(hidden, showForBullet(hidden, "a"));
    expect(ticks(shown)).toBe("A(--) b()");
    expect(shown.entries[0].description_off).toBe(true);

    const off = cv([entry("a", ul(li("x")), { hidden: true }), entry("b", ul(li("z")))]);
    expect(ticks(apply(off, showForBullet(off, "a")))).toBe("A(-) B(z)");
  });

  it("leaves ticks as they are where a bullet shows anyway", () => {
    const section = cv([entry("a", ul(li("x"), li("y", true)))]);
    expect(showForBullet(section, "a")).toEqual({});
    expect(showForBullet(section, "gone")).toEqual({});
  });

  it("puts ticks back if nothing was written", () => {
    const before = cv([entry("a", ul(li("x")))], { hidden: true });
    const after = apply(before, showForBullet(before, "a"));
    expect(ticks(apply(after, putBack(before, after, "a")(after)))).toBe("a(x)");

    const written = { ...after, entries: [{ ...after.entries[0], title: "New" }] };
    expect(putBack(before, after, "a")(written)).toEqual({});
    expect(putBack(before, after, "a")({ ...after, hidden: true })).toEqual({});

    const withBlank = { ...after, entries: [{ ...after.entries[0], content: after.entries[0].content.replace("</ul>", "<li><p></p></li></ul>") }] };
    expect(putBack(before, after, "a")(withBlank)).toMatchObject({ hidden: true });
  });

  it("puts a new entry that stayed blank away again", () => {
    const before = cv([entry("a")], { hidden: true });
    const after = apply(before, addEntry(before, blank));
    expect(ticks(apply(after, putBack(before, after, "new")(after)))).toBe("a()");
  });

  it("says what an entry has of its own", () => {
    const section = first([cv([entry("a", "", { description: "S", role: "R" }), entry("b", "", { title: " " })])]);
    expect(section.entries.map(({ has }) => has)).toEqual([
      { title: true, summary: true, details: true },
      { title: false, summary: false, details: false },
    ]);
  });
});

describe("searching while adding", () => {
  const list = () =>
    build([cv([entry("a", ul(li("x", false, "Ruby"), li("y", false, "Go"), li("new", false, "Rust"))), entry("n", "", { title: "" })])]);
  const found = (keep?: Parameters<typeof filterChecklist>[2]) =>
    filterChecklist(list(), "ruby", keep).flatMap(({ entries }) => entries.map((each) => each.id + ":" + ids(each.items)));

  it("keeps a new entry", () => {
    expect(found()).toEqual(["a:x"]);
    expect(found({ sectionId: 1, entryId: "n", known: [] })).toEqual(["a:x", "n:"]);
  });

  it("keeps new items only", () => {
    expect(found({ sectionId: 1, entryId: "a", known: ["x", "y"] })).toEqual(["a:xnew"]);
  });

  it("keeps a new section", () => {
    const sections = build([cv([entry("a")], { id: 1 }), cv([emptyEntry()], { id: 2, section_type: "Section" })]);
    expect(filterChecklist(sections, "zzz", { sectionId: 2, entryId: null, known: [] }).map(({ sectionId }) => sectionId)).toEqual([2]);
  });
});
