import { createMonthDrafts } from "@/lib/resume/monthDrafts";
import { createDrafts } from "@/lib/resume/sectionDrafts";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { CurriculumSection, SectionEntry } from "@/lib/types";
import { act, useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditTarget } from "./editChannel";
import { useCvEdits } from "./useCvEdits";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, changes: Partial<SectionEntry> = {}): SectionEntry => ({ ...emptyEntry(), id, title: id, ...changes });
const BULLETS = '<ul><li data-cv-item="x"><p>X</p></li><li data-cv-item="y" data-cv-off="true"><p>Y</p></li></ul>';
const BLANK = "<li><p></p></li>";

const section = (id: number, changes: Partial<CurriculumSection> = {}) =>
  ({
    id,
    curriculum_id: 1,
    section_type: `S${id}`,
    hidden: false,
    placement: null,
    entries: [entry("a", { content: BULLETS }), entry("b")],
    base_items: {},
    base_fields: {},
    ...changes,
  }) as unknown as CurriculumSection;

let drafts: ReturnType<typeof createDrafts<CurriculumSection>>;
let months: ReturnType<typeof createMonthDrafts>;
let hook: ReturnType<typeof useCvEdits>;
let root: Root;
let setView: (view: "cards" | "page") => void;
/** What the views were asked to go to. */
let asked: EditTarget[];

const Cv = () => {
  const [view, set] = useState<"cards" | "page">("cards");
  const result = useCvEdits({
    current: drafts.current,
    change: drafts.change,
    view,
    showCv: () => {},
    isUnfinished: (sectionId, entryId) => months.isUnfinished({ sectionId, entryId }),
  });
  Object.assign(globalThis, { shownHook: result, shownSetView: set });
  return null;
};
const take = () => {
  hook = (globalThis as unknown as { shownHook: typeof hook }).shownHook;
  setView = (globalThis as unknown as { shownSetView: typeof setView }).shownSetView;
};

const load = (...sections: CurriculumSection[]) => {
  drafts.load(sections);
  // The CV: places to focus, and a control outside them.
  document.body.innerHTML =
    sections
      .map(
        ({ id }) =>
          `<div data-section-id="${id}"><input class="heading"><div class="entries"></div></div>`
      )
      .join("") + '<button id="out"></button><div role="dialog" data-floating-ui-portal><input class="card"></div>';
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Cv />));
  take();
  asked = [];
  hook.channel.handle((target) => {
    asked.push(target);
    const at = document.querySelector(`[data-section-id="${target.sectionId}"]`)!;
    if (target.what === "heading") at.querySelector<HTMLElement>(".heading")!.focus();
    else {
      const entries = at.querySelector(".entries")!;
      entries.innerHTML = `<div data-entry-id="${target.entryId}"><input></div>`;
      const card = target.what === "details" && hook.added?.what === "details";
      (card ? document.querySelector<HTMLElement>(".card")! : entries.querySelector("input")!).focus();
    }
    return true;
  });
};

const settle = () => {
  act(() => void vi.advanceTimersByTime(20));
  take();
};
/** A press on the checklist: the focus goes first, and the click comes before any timer. */
const press = (click: () => void = () => {}) => {
  act(() => {
    document.dispatchEvent(new Event("pointerdown"));
    document.querySelector<HTMLElement>("#out")!.focus();
    document.dispatchEvent(new Event("pointerup"));
    click();
  });
  settle();
};
const now = (id = 1) => drafts.current().find((each) => each.id === id)!;
const entryNow = (entryId: string) => now().entries.find(({ id }) => id === entryId);
const shown = () => (now().hidden ? "out" : now().entries.filter(({ hidden }) => !hidden).map(({ id }) => id).join());
const write = (entryId: string, changes: Partial<SectionEntry>) =>
  act(() =>
    drafts.change(1, ({ entries }) => ({ entries: entries.map((each) => (each.id === entryId ? { ...each, ...changes } : each)) }))
  );
const edit = (target: EditTarget) => press(() => hook.edits.edit(target));
/** "+" on a section. Returns the new entry's id. */
const addEntry = () => {
  press(() => hook.edits.addEntry(1));
  return now().entries.at(-1)!.id;
};

beforeEach(() => {
  vi.stubGlobal("CSS", { escape: (text: string) => text });
  vi.useFakeTimers();
  document.hasFocus = () => true;
  months = createMonthDrafts();
  drafts = createDrafts<CurriculumSection>({ save: async (each) => each, onChange: () => {}, onError: () => {} });
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("a new entry in a left out section", () => {
  const before = section(1, { hidden: true });
  const PLACES: ["title" | "summary" | "details" | "bullet"][] = [["title"], ["summary"], ["details"]];

  it("goes when it is left blank", () => {
    load(before);
    const id = addEntry();
    expect(shown()).toBe(id);
    press();
    expect(shown()).toBe("out");
    expect(now().entries).toEqual(before.entries);
  });

  it.each(PLACES)("stays while the user goes on to its %s", (what) => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, entryId: id, what } as EditTarget);
    expect(shown()).toBe(id);
    expect(hook.added).toMatchObject({ sectionId: 1, entryId: id });
    // Left blank after all.
    press();
    expect(now().entries).toEqual(before.entries);
    expect(now().hidden).toBe(true);
  });

  it.each(PLACES)("stays once its %s is written in", (what) => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, entryId: id, what } as EditTarget);
    write(id, { role: "Cook" });
    press();
    expect(shown()).toBe(id);
  });

  it("offers its body and title for its pencil as before", () => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, entryId: id, what: "title" });
    expect(hook.added?.what).toBe("entry");
  });

  it("stays while the user goes on to its first bullet, also one that is dropped", () => {
    load(before);
    const id = addEntry();
    press(() => hook.edits.addBullet(1, id));
    expect(shown()).toBe(id);
    write(id, { content: `<ul>${BLANK}</ul>` });
    press(() => hook.edits.addBullet(1, id));
    expect(shown()).toBe(id);
    write(id, { content: "" });
    press();
    expect(shown()).toBe("out");
  });

  it("keeps its section while the heading is edited, until that is left", () => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, what: "heading" });
    expect(shown()).toBe(id);
    expect(hook.added).toMatchObject({ what: "section", entryId: id });
    press();
    expect(shown()).toBe("out");
  });

  it("stays with a heading that was changed", () => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, what: "heading" });
    act(() => drafts.change(1, { section_type: "New" }));
    press();
    expect(shown()).toBe(id);
  });

  it("goes before another of its section is edited, which is ticked as it is then", () => {
    load(before);
    addEntry();
    edit({ sectionId: 1, entryId: "b", what: "title" });
    expect(shown()).toBe("b");
    expect(now().entries.map(({ id }) => id)).toEqual(["a", "b"]);
    press();
    expect(shown()).toBe("b");
  });

  it("goes before another one is added", () => {
    load(before);
    const first = addEntry();
    const second = addEntry();
    expect(second).not.toBe(first);
    expect(now().entries.map(({ id }) => id)).toEqual(["a", "b", second]);
    press();
    expect(now().entries).toEqual(before.entries);
    expect(now().hidden).toBe(true);
  });

  it("goes before another section is edited", () => {
    load(before, section(2));
    addEntry();
    act(() => hook.edits.edit({ sectionId: 2, what: "heading" }));
    expect(now().hidden).toBe(true);
    expect(document.activeElement?.className).toBe("heading");
  });

  it("goes as the view changes", () => {
    load(before);
    addEntry();
    act(() => setView("page"));
    settle();
    expect(now().entries).toEqual(before.entries);
  });

  it("is kept for a press that comes after it was left but before it went", () => {
    load(before);
    const id = addEntry();
    act(() => {
      document.querySelector<HTMLElement>("#out")!.focus();
      vi.advanceTimersByTime(0);
      hook.edits.edit({ sectionId: 1, entryId: id, what: "title" });
    });
    settle();
    expect(shown()).toBe(id);
  });

  it("stays with a half-typed or half-picked month", () => {
    load(before);
    const id = addEntry();
    edit({ sectionId: 1, entryId: id, what: "details" });
    const done = months.holdHalfPicked({ sectionId: 1, entryId: id });
    press();
    expect(shown()).toBe(id);
    done();

    load(before);
    const other = addEntry();
    months.set({ sectionId: 1, entryId: other }, { start: "2021-", end: "" });
    press();
    expect(shown()).toBe(other);
  });
});

describe("a bullet in a left out entry", () => {
  const before = section(1, { entries: [entry("a", { content: BULLETS, hidden: true }), entry("b")] });

  it("puts its ticks back after its entry's title was only looked at", () => {
    load(before);
    press(() => hook.edits.addBullet(1, "a"));
    expect(shown()).toBe("a,b");
    edit({ sectionId: 1, entryId: "a", what: "title" });
    expect(shown()).toBe("a,b");
    press();
    expect(now().entries).toEqual(before.entries);
  });

  it("puts its ticks back after a second bullet was left empty too", () => {
    load(before);
    press(() => hook.edits.addBullet(1, "a"));
    press(() => hook.edits.addBullet(1, "a"));
    expect(shown()).toBe("a,b");
    press();
    expect(shown()).toBe("b");
  });

  it("puts its ticks back for something else while the empty bullet isn't dropped yet", () => {
    load(before);
    press(() => hook.edits.addBullet(1, "a"));
    write("a", { content: entryNow("a")!.content.replace("</ul>", `${BLANK}</ul>`) });
    edit({ sectionId: 1, entryId: "b", what: "title" });
    expect(shown()).toBe("b");
  });

  it("keeps an item that is edited next", () => {
    load(before);
    press(() => hook.edits.addBullet(1, "a"));
    edit({ sectionId: 1, entryId: "a", what: "item", itemId: "x" });
    press();
    expect(shown()).toBe("a,b");
    expect(entryNow("a")!.content).toBe(BULLETS);
  });
});

describe("adding at a place", () => {
  const addAt = (entryId: string | null, after: string | null, what: "bullet" | "paragraph" | "entry") =>
    press(() => hook.edits.addAt({ sectionId: 1, entryId, after }, what));

  it.each(["bullet", "paragraph"] as const)("asks for a %s there", (kind) => {
    load(section(1));
    addAt("a", "x", kind);
    expect(asked.at(-1)).toEqual({ sectionId: 1, what: "insert", entryId: "a", after: "x", kind });
    expect(hook.added).toMatchObject({ what: "bullet", sectionId: 1, entryId: "a" });
  });

  it("asks for the top of the first entry, under the heading", () => {
    load(section(1));
    addAt(null, null, "paragraph");
    expect(asked.at(-1)).toMatchObject({ what: "insert", entryId: "a", after: null, kind: "paragraph" });
  });

  it.each(["bullet", "paragraph"] as const)("shows a left out entry for a %s, and puts its ticks back if nothing was written", (kind) => {
    const before = section(1, { entries: [entry("a", { content: BULLETS, hidden: true }), entry("b")] });
    load(before);
    addAt("a", "x", kind);
    expect(shown()).toBe("a,b");
    // It shows with none of its items.
    expect(asked.at(-1)).toMatchObject({ what: "insert", entryId: "a", after: null, kind });
    press();
    expect(now().entries).toEqual(before.entries);
  });

  it("puts a left out section's ticks back", () => {
    const before = section(1, { hidden: true });
    load(before);
    addAt(null, null, "bullet");
    expect(shown()).toBe("a");
    press();
    expect(now().hidden).toBe(true);
    expect(now().entries).toEqual(before.entries);
  });

  it("adds an entry first, or after another, and asks for its title", () => {
    load(section(1));
    addAt(null, null, "entry");
    const first = now().entries[0].id;
    expect(now().entries.map(({ id }) => id)).toEqual([first, "a", "b"]);
    expect(asked.at(-1)).toEqual({ sectionId: 1, what: "title", entryId: first });
    expect(hook.added).toMatchObject({ what: "entry", entryId: first });

    addAt("a", null, "entry");
    expect(now().entries.map(({ id }) => id).slice(1)).toEqual(["a", now().entries[2].id, "b"]);
  });

  it("takes a new entry in a left out section away again if it stays blank", () => {
    const before = section(1, { hidden: true });
    load(before);
    addAt("a", null, "entry");
    expect(shown()).toBe(now().entries[1].id);
    press();
    expect(now().entries).toEqual(before.entries);
    expect(now().hidden).toBe(true);
  });
});

it("ticks by what the draft has, not by what was shown", () => {
  load(section(1));
  edit({ sectionId: 1, entryId: "a", what: "item", itemId: "x" });
  expect(entryNow("a")!.content).toBe(BULLETS);
  edit({ sectionId: 1, entryId: "a", what: "item", itemId: "y" });
  expect(entryNow("a")!.content).not.toContain("data-cv-off");
});
