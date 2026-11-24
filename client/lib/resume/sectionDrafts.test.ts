import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDrafts, sameFields, SectionPatch } from "./sectionDrafts";
import { mergeEdited, setItemsOff } from "./items";
import { waitForSaves } from "./saveTracker";
import { emptyEntry } from "./sectionEntries";
import { SectionEntry, SectionFields, SectionPlacement } from "@/lib/types";

interface Section extends SectionFields {
  id: number;
  hidden: boolean;
  placement: SectionPlacement | null;
  base_items: Record<string, string>;
  updated_at: string;
}

const P = (id: string, text: string) => `<p data-cv-item="${id}">${text}</p>`;
const entry = (id: string, changes: Partial<SectionEntry> = {}): SectionEntry => ({ ...emptyEntry(), id, ...changes });
const section = (changes: Partial<Section> = {}): Section => ({
  id: 1,
  section_type: "Work",
  entries: [entry("e1", { title: "One", content: P("a", "First") + P("b", "Second") }), entry("e2", { title: "Two" })],
  hidden: false,
  placement: null,
  base_items: {},
  updated_at: "0",
  ...changes,
});
const edit =
  (id: string, changes: Partial<SectionEntry>) =>
  (current: SectionFields): SectionPatch => ({
    entries: current.entries.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  });

type Call = { section: Section; patch: SectionPatch; resolve: (next?: Partial<Section>) => void; reject: (error: unknown) => void };

// Every request made in a test, so none is left pending for the next.
const made: Call[] = [];

const setup = (sections = [section()], busy = () => false) => {
  const calls: Call[] = [];
  const onError = vi.fn();
  const onChange = vi.fn();
  const drafts = createDrafts<Section>({
    save: (target, patch) =>
      new Promise((resolve, reject) => {
        const call = { section: target, patch, resolve: (next = {}) => resolve({ ...target, ...patch, ...next }), reject };
        calls.push(call);
        made.push(call);
      }),
    onChange,
    onError,
    busy,
  });
  drafts.load(sections);
  const shown = (id = 1): Section => onChange.mock.lastCall![0].find((item: Section) => item.id === id);
  const version = (entryId: string, id = 1): number => onChange.mock.lastCall![1][id]?.[entryId] ?? 0;
  return { drafts, calls, onError, onChange, shown, version };
};

const settle = () => vi.advanceTimersByTimeAsync(0);
const pause = () => vi.advanceTimersByTimeAsync(600);

beforeEach(() => void vi.useFakeTimers());
afterEach(async () => {
  while (made.length > 0 || vi.getTimerCount() > 0) {
    made.splice(0).forEach((call) => call.resolve());
    await pause();
  }
  vi.useRealTimers();
});

describe("sameFields", () => {
  it("takes an entry saved before summaries had ticks as ticked", () => {
    const { description_off, ...older } = entry("a", { description: "Sum" });
    expect(description_off).toBe(false);
    expect(sameFields({ section_type: "Work", entries: [older] }, { section_type: "Work", entries: [{ ...older, description_off: false }] })).toBe(true);
    expect(sameFields({ section_type: "Work", entries: [older] }, { section_type: "Work", entries: [{ ...older, description_off: true }] })).toBe(false);
  });

  it("ignores spacing, the editor's trailing paragraph and key order", () => {
    const saved = { section_type: "Projects", entries: [entry("a", { content: "<p>x</p>" })] };
    const { title, ...rest } = entry("a", { content: "<p>x</p><p></p>", role: " " });
    expect(sameFields(saved, { section_type: "Projects ", entries: [{ ...rest, title: `${title} ` }] })).toBe(true);
  });

  it("notices order, hidden and text changes", () => {
    const base = { section_type: "Projects", entries: [entry("a"), entry("b")] };
    expect(sameFields(base, { ...base, entries: [base.entries[1], base.entries[0]] })).toBe(false);
    expect(sameFields(base, { ...base, entries: [entry("a", { hidden: true }), entry("b")] })).toBe(false);
    expect(sameFields(base, { ...base, entries: [entry("a", { content: "<p>x</p>" }), entry("b")] })).toBe(false);
  });
});

describe("saving", () => {
  it("sends two changes within the delay as one save", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "Jobs" });
    await vi.advanceTimersByTimeAsync(500);
    drafts.change(1, edit("e1", { title: "New" }));
    await vi.advanceTimersByTimeAsync(599);
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].patch.section_type).toBe("Jobs");
    expect(calls[0].patch.entries![0].title).toBe("New");
  });

  it("sends hidden and placement the same way, without unchanged text", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, { hidden: true });
    drafts.change(1, { placement: "sidebar" });
    expect(shown().hidden).toBe(true);
    await pause();

    expect(calls.map((call) => call.patch)).toEqual([{ hidden: true, placement: "sidebar" }]);
  });

  it("never overlaps saves of one section", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "A" });
    await pause();
    drafts.change(1, { section_type: "B" });
    await pause();
    expect(calls).toHaveLength(1);

    calls[0].resolve();
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].patch.section_type).toBe("B");
  });

  it("waits for the pause even if the request before it settles first", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "A" });
    await pause();
    drafts.change(1, { section_type: "B" });
    calls[0].resolve();
    await settle();
    expect(calls).toHaveLength(1);
    await pause();
    expect(calls).toHaveLength(2);
  });

  it("saves sections independently", async () => {
    const { drafts, calls } = setup([section(), section({ id: 2 })]);
    drafts.change(1, { section_type: "A" });
    drafts.change(2, { section_type: "B" });
    await pause();
    expect(calls.map((call) => call.section.id)).toEqual([1, 2]);
  });

  it("doesn't save changes with no real difference", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, edit("e1", { title: "One ", content: P("a", "First") + P("b", "Second") + "<p></p>" }));
    await pause();
    expect(calls).toHaveLength(0);
    await expect(drafts.flush()).resolves.toBe(true);
  });

  it("doesn't save an end date before its start, but does save hidden", async () => {
    const { drafts, calls, onError } = setup();
    drafts.change(1, edit("e1", { start_date: "2024-02-01", end_date: "2024-01-01" }));
    await pause();
    await expect(drafts.flush()).resolves.toBe(true);
    expect(calls).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();

    drafts.change(1, { hidden: true });
    await pause();
    expect(calls[0].patch).toEqual({ hidden: true });
    calls[0].resolve();
    await settle();

    drafts.change(1, edit("e1", { end_date: "2024-03-01" }));
    await pause();
    expect(calls[1].patch.entries![0]).toMatchObject({ start_date: "2024-02-01", end_date: "2024-03-01" });
  });
});

describe("a tick and typing", () => {
  it("saves both when the tick follows unsaved typing", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, edit("e1", { content: P("a", "Typed") + P("b", "Second") }), { entryId: "e1", version: 0 });
    drafts.change(1, (current) => edit("e1", { content: setItemsOff(current.entries[0].content, ["b"], true) })(current));
    await pause();
    expect(calls).toHaveLength(1);
    expect(calls[0].patch.entries![0].content).toBe(
      P("a", "Typed") + '<p data-cv-item="b" data-cv-off="true">Second</p>'
    );
  });

  it("keeps a tick made just before a keystroke, when the editor doesn't know of it yet", async () => {
    const { drafts, shown } = setup();
    const ticked = setItemsOff(shown().entries[0].content, ["b"], true);
    drafts.change(1, edit("e1", { content: ticked }));
    const typed = P("a", "First!") + P("b", "Second");
    drafts.change(
      1,
      (current) => edit("e1", { content: mergeEdited(current.entries[0].content, typed, []) })(current),
      { entryId: "e1", version: 0 }
    );
    expect(shown().entries[0].content).toBe(P("a", "First!") + '<p data-cv-item="b" data-cv-off="true">Second</p>');
  });

  it("doesn't let an editor that is about to be replaced undo a text replaced outside it", () => {
    const { drafts, shown } = setup();
    drafts.change(1, edit("e1", { content: P("a", "Library") }));
    drafts.change(1, edit("e1", { title: "T", content: P("a", "First!") }), { entryId: "e1", version: 0 });
    expect(shown().entries[0]).toMatchObject({ title: "T", content: P("a", "Library") });
  });
});

describe("remounting", () => {
  it("only remounts the entry whose text changed outside its editor", () => {
    const { drafts, version } = setup();
    drafts.change(1, edit("e1", { content: P("a", "Typed") }), { entryId: "e1", version: 0 });
    drafts.change(1, edit("e1", { title: "T" }));
    expect(version("e1")).toBe(0);

    drafts.change(1, edit("e1", { content: setItemsOff(P("a", "Typed"), ["a"], true) }));
    const ticked = version("e1");
    expect(ticked).toBeGreaterThan(0);
    expect(version("e2")).toBe(0);

    drafts.change(1, edit("e1", { start_date: "2024-01-01" }));
    expect(version("e1")).toBeGreaterThan(ticked);
  });

  it("remounts nothing when the order changes", () => {
    const { drafts, version } = setup();
    drafts.change(1, (current) => ({ entries: [...current.entries].reverse() }));
    expect(version("e1")).toBe(0);
    expect(version("e2")).toBe(0);
  });
});

describe("a save response", () => {
  it("brings server metadata but never replaces later edits", async () => {
    const { drafts, calls, shown, version } = setup();
    drafts.change(1, edit("e1", { title: "Sent" }));
    await pause();
    drafts.change(1, edit("e1", { title: "Later", content: P("a", "Later") }), { entryId: "e1", version: 0 });
    drafts.change(1, { hidden: true });
    calls[0].resolve({ base_items: { a: "base" }, updated_at: "1", entries: [entry("e1", { content: P("server", "First") }), entry("e2")] });
    await settle();

    expect(shown()).toMatchObject({ base_items: { a: "base" }, updated_at: "1", hidden: true });
    expect(shown().entries[0]).toMatchObject({ title: "Later", content: P("a", "Later") });
    expect(version("e1")).toBe(0);
    await pause();
    expect(calls[1].patch.entries![0].title).toBe("Later");
    expect(calls[1].patch.hidden).toBe(true);
  });

  it("takes what the server changed and remounts those entries only", async () => {
    const { drafts, calls, shown, version } = setup();
    drafts.change(1, edit("e1", { title: "Sent ", content: "<p>New</p>" }), { entryId: "e1", version: 0 });
    await pause();
    calls[0].resolve({ entries: [entry("e1", { title: "Sent", content: P("x", "New") }), entry("e2", { title: "Two" })] });
    await settle();

    expect(shown().entries[0]).toMatchObject({ title: "Sent ", content: P("x", "New") });
    expect(version("e1")).toBeGreaterThan(0);
    expect(version("e2")).toBe(0);
    await drafts.flush();
    expect(calls).toHaveLength(1);
  });

  it("ignores differences in how the same html is written", async () => {
    const { drafts, calls, version, shown } = setup();
    const typed = '<p data-cv-item="a"><span style="color: red;">A&nbsp;b</span></p>';
    drafts.change(1, edit("e1", { content: typed }), { entryId: "e1", version: 0 });
    await pause();
    calls[0].resolve({
      entries: [entry("e1", { title: "One", content: '<p data-cv-item="a"><span style="color:red;">A b</span></p>' }), entry("e2", { title: "Two" })],
    });
    await settle();
    expect(version("e1")).toBe(0);
    expect(shown().entries[0].content).toBe(typed);
    await drafts.flush();
    expect(calls).toHaveLength(1);
  });

  it("leaves the text alone while something is being composed", async () => {
    const { drafts, calls, shown, version } = setup([section()], () => true);
    drafts.change(1, edit("e1", { content: "<p>New</p>" }), { entryId: "e1", version: 0 });
    await pause();
    calls[0].resolve({ entries: [entry("e1", { title: "One", content: P("x", "New") }), entry("e2", { title: "Two" })] });
    await settle();
    expect(shown().entries[0].content).toBe("<p>New</p>");
    expect(version("e1")).toBe(0);
  });
});

describe("a failed save", () => {
  it("keeps the edits, reports it, and retries on the next change or flush", async () => {
    const { drafts, calls, onError, shown } = setup();
    drafts.change(1, { section_type: "A" });
    const flushed = drafts.flush();
    const error = new Error("offline");
    calls[0].reject(error);
    await expect(flushed).resolves.toBe(false);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(shown().section_type).toBe("A");
    await pause();
    expect(calls).toHaveLength(1);

    drafts.change(1, edit("e1", { title: "B" }));
    await pause();
    expect(calls[1].patch).toMatchObject({ section_type: "A", entries: [{ title: "B" }, {}] });
    calls[1].reject(error);
    await settle();

    const again = drafts.flush();
    calls[2].resolve();
    await expect(again).resolves.toBe(true);
  });
});

describe("flush and dispose", () => {
  it("flush sends right away, and what changed meanwhile", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "A" });
    const flushed = drafts.flush();
    expect(calls).toHaveLength(1);
    drafts.change(1, { section_type: "B" });
    calls[0].resolve();
    await settle();
    expect(calls).toHaveLength(2);
    calls[1].resolve();
    await expect(flushed).resolves.toBe(true);
    await pause();
    expect(calls).toHaveLength(2);
  });

  it("dispose sends pending changes, after the request before them", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "A" });
    await pause();
    drafts.change(1, { section_type: "B" });
    drafts.dispose();
    calls[0].resolve();
    await settle();
    expect(calls[1].patch.section_type).toBe("B");
  });

  it("load sends the pending changes of what it replaces, without showing their result", async () => {
    const { drafts, calls, onChange } = setup();
    drafts.change(1, { section_type: "A" });
    drafts.load([section({ section_type: "Other" })]);
    expect(calls[0].patch.section_type).toBe("A");
    calls[0].resolve();
    await settle();
    expect(onChange.mock.lastCall![0][0].section_type).toBe("Other");
  });

  it("waitForSaves waits for the pause and the request, also a queued one", async () => {
    const { drafts, calls } = setup();
    let done = false;
    drafts.change(1, { section_type: "A" });
    void waitForSaves(60_000).then(() => (done = true));
    await pause();
    expect(done).toBe(false);
    drafts.change(1, { section_type: "B" });
    await pause();
    calls[0].resolve();
    await settle();
    expect(done).toBe(false);
    calls[1].resolve();
    await settle();
    expect(done).toBe(true);
  });

  it("waitForSaves doesn't hang on a failed save or on nothing to save", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, { section_type: "A" });
    await pause();
    calls[0].reject(new Error());
    await settle();
    await expect(waitForSaves()).resolves.toBe(true);
    drafts.change(1, { section_type: "Work" });
    await pause();
    await expect(waitForSaves()).resolves.toBe(true);
  });
});

describe("replace", () => {
  it("shows the record, remounting what changed, and adds one it doesn't have", async () => {
    const { drafts, calls, shown, version } = setup();
    drafts.replace(section({ entries: [entry("e1", { title: "One", content: P("a", "Library") }), entry("e2", { title: "Two" })] }));
    expect(shown().entries[0].content).toBe(P("a", "Library"));
    expect(version("e1")).toBeGreaterThan(0);
    expect(version("e2")).toBe(0);

    drafts.replace(section({ id: 2 }));
    expect(shown(2)).toBeDefined();
    await pause();
    expect(calls).toHaveLength(0);
  });

  it("keeps unsaved edits of entries the record doesn't change", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, edit("e2", { title: "Typed" }));
    drafts.change(1, (current) => ({ entries: [...current.entries, entry("new", { title: "Added" })] }));
    drafts.replace(section({ entries: [entry("e1", { title: "Server" }), entry("e2", { title: "Two" })], updated_at: "1" }));
    expect(shown().entries.map(({ title }) => title)).toEqual(["Server", "Typed", "Added"]);
    expect(shown().updated_at).toBe("1");
    await pause();
    expect(calls[0].patch.entries).toHaveLength(3);
  });

  it("isn't undone by the response to an earlier save", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, edit("e1", { title: "Sent" }));
    await pause();
    drafts.replace(section({ entries: [entry("e1", { title: "Replaced" }), entry("e2", { title: "Two" })], base_items: { a: "new" } }));
    calls[0].resolve({ base_items: { a: "old" } });
    await settle();
    expect(shown().entries[0].title).toBe("Replaced");
    expect(shown().base_items).toEqual({ a: "new" });
    // The server may have applied them in either order.
    await pause();
    expect(calls[1].patch.entries![0].title).toBe("Replaced");
  });
});

describe("flush while text is composed", () => {
  const differing = { entries: [entry("e1", { title: "One", content: P("x", "New") }), entry("e2", { title: "Two" })] };
  const type = (drafts: ReturnType<typeof setup>["drafts"]) =>
    drafts.change(1, edit("e1", { content: "<p>New</p>" }), { entryId: "e1", version: 0 });

  it("doesn't send what was saved again and again", async () => {
    const { drafts, calls } = setup([section()], () => true);
    type(drafts);
    const flushed = drafts.flush();
    calls[0].resolve(differing);
    await settle();
    expect(calls).toHaveLength(1);
    await expect(flushed).resolves.toBe(true);
    await drafts.flush();
    expect(calls).toHaveLength(1);

    drafts.change(1, { hidden: true });
    await pause();
    expect(calls[1].patch.entries![0].content).toBe("<p>New</p>");
  });

  it("nor a request it waited for", async () => {
    const { drafts, calls } = setup([section()], () => true);
    type(drafts);
    await pause();
    drafts.dispose();
    calls[0].resolve(differing);
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("ignores composing once disposed", async () => {
    const { drafts, calls, shown } = setup([section()], () => true);
    type(drafts);
    drafts.dispose();
    calls[0].resolve(differing);
    await settle();
    expect(shown().entries[0].content).toBe(P("x", "New"));
  });
});

describe("replace and what isn't saved yet", () => {
  const titles = (target: Section) => target.entries.map(({ title }) => title);
  const reverse = (current: SectionFields) => ({ entries: [...current.entries].reverse() });
  const withNew = section().entries.flatMap((item) => [item, ...(item.id === "e1" ? [entry("lib", { title: "Lib" })] : [])]);

  it("keeps an unsaved order, with new entries after their neighbour", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, reverse);
    drafts.replace(section({ entries: withNew }));
    expect(titles(shown())).toEqual(["Two", "One", "Lib"]);
    await pause();
    expect(titles(calls[0].section)).toEqual(["Two", "One", "Lib"]);
  });

  it("keeps an order being saved, whether or not the record has it", async () => {
    for (const entries of [withNew, [...withNew].reverse()]) {
      const { drafts, shown } = setup();
      drafts.change(1, reverse);
      await pause();
      drafts.replace(section({ entries }));
      expect(titles(shown()).filter((title) => title !== "Lib")).toEqual(["Two", "One"]);
    }
  });

  it("takes the record's order if it changed there", () => {
    const { drafts, shown } = setup();
    drafts.replace(section(reverse(section())));
    expect(titles(shown())).toEqual(["Two", "One"]);
  });

  it("keeps typing newer than a save that the record contains", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, edit("e1", { title: "Sent" }));
    drafts.change(1, { section_type: "Sent", hidden: true });
    await pause();
    drafts.change(1, edit("e1", { title: "Newer" }));
    drafts.change(1, { section_type: "Newer", hidden: false });
    drafts.replace(
      section({ section_type: "Sent", hidden: true, entries: [entry("e1", { ...section().entries[0], title: "Sent" }), section().entries[1]] })
    );
    expect(shown()).toMatchObject({ section_type: "Newer", hidden: false });
    expect(shown().entries[0].title).toBe("Newer");
    calls[0].resolve();
    await settle();
    await pause();
    expect(calls[1].patch).toMatchObject({ section_type: "Newer", hidden: false, entries: [{ title: "Newer" }, {}] });
  });

  it("keeps an entry deleted since, if the record only has it from a save in flight", async () => {
    const { drafts, shown } = setup();
    drafts.change(1, edit("e1", { title: "Sent" }));
    await pause();
    drafts.change(1, (current) => ({ entries: current.entries.slice(1) }));
    drafts.replace(section({ entries: [entry("e1", { ...section().entries[0], title: "Sent" }), section().entries[1]] }));
    expect(titles(shown())).toEqual(["Two"]);
  });

  it("always leaves an entry to write in, the same one if there was one", () => {
    const { drafts, shown } = setup();
    drafts.replace(section({ entries: [] }));
    expect(shown().entries).toMatchObject([{ id: "e1", title: "", content: "" }]);

    drafts.change(1, (current) => ({ entries: [entry("e9", { title: "Mine" }), ...current.entries] }));
    drafts.change(1, (current) => ({ entries: current.entries.slice(1) }));
    drafts.change(1, () => ({ entries: [] }));
    drafts.replace(section({ entries: [entry("e1")] }));
    expect(shown().entries).toHaveLength(1);
  });
});

describe("dispose during a deletion", () => {
  for (const fails of [true, false]) {
    it(fails ? "still sends pending changes if it fails" : "sends nothing if it succeeds", async () => {
      const { drafts, calls } = setup();
      drafts.change(1, { section_type: "A" });
      let finish!: () => void;
      const deletion = new Promise<void>((resolve, reject) => (finish = () => (fails ? reject(new Error()) : resolve())));
      void drafts.remove(1, deletion).catch(() => undefined);
      drafts.dispose();
      await pause();
      expect(calls).toHaveLength(0);

      finish();
      await settle();
      expect(calls).toHaveLength(fails ? 1 : 0);
      calls[0]?.resolve();
      await settle();
      expect(calls).toHaveLength(fails ? 1 : 0);
    });
  }
});

describe("the list", () => {
  it("add leaves sections it has alone", () => {
    const { drafts, shown } = setup();
    drafts.change(1, { section_type: "Typed" });
    drafts.add([section(), section({ id: 2 })]);
    expect(shown().section_type).toBe("Typed");
    expect(shown(2)).toBeDefined();
  });

  it("reorder keeps drafts", () => {
    const { drafts, onChange } = setup([section(), section({ id: 2 })]);
    drafts.change(1, { section_type: "Typed" });
    drafts.reorder([2, 1]);
    const [list] = onChange.mock.lastCall!;
    expect(list.map((item: Section) => [item.id, item.section_type])).toEqual([[2, "Work"], [1, "Typed"]]);
  });

  it("gives a section without entries one to write in", () => {
    const { shown, drafts } = setup([section({ entries: [] })]);
    expect(shown().entries).toHaveLength(1);
    const { id } = shown().entries[0];
    drafts.change(1, { hidden: true });
    expect(shown().entries[0].id).toBe(id);
  });

  it("remove drops pending saves", async () => {
    const { drafts, calls, onChange } = setup();
    drafts.change(1, { section_type: "A" });
    await drafts.remove(1);
    await pause();
    expect(onChange.mock.lastCall![0]).toEqual([]);
    expect(calls).toHaveLength(0);
    await expect(waitForSaves()).resolves.toBe(true);
  });

  it("holds saves during a deletion, and sends them if it fails", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, { section_type: "A" });
    let fail!: (error: unknown) => void;
    const removed = drafts.remove(1, new Promise((_, reject) => (fail = reject)));
    const caught = vi.fn();
    void removed.catch(caught);
    await pause();
    expect(calls).toHaveLength(0);
    expect(shown()).toBeDefined();

    fail(new Error("offline"));
    await settle();
    expect(caught).toHaveBeenCalled();
    expect(calls[0].patch.section_type).toBe("A");
  });

  it("doesn't report a save that fails because its section was deleted", async () => {
    const { drafts, calls, onError } = setup();
    drafts.change(1, { section_type: "A" });
    await pause();
    const removed = drafts.remove(1, Promise.resolve());
    await removed;
    calls[0].reject(new Error("404"));
    await settle();
    expect(onError).not.toHaveBeenCalled();
  });
});

it("gives the sections as edited right away", () => {
  const { drafts } = setup();
  drafts.change(1, { section_type: "Jobs" });
  expect(drafts.current().map(({ section_type }) => section_type)).toEqual(["Jobs"]);
});

it("keeps edits that can't be sent yet when a record changes their entry", () => {
  const { drafts, shown } = setup();
  drafts.change(1, edit("e1", { title: "Typed", start_date: "2024-02-01", end_date: "2023-02-01" }));
  drafts.replace(section({ entries: [entry("e1", { title: "Theirs" }), entry("e2", { title: "New two" })] }));
  expect(shown().entries.map(({ title }) => title)).toEqual(["Typed", "New two"]);
});

describe("saved", () => {
  it("is the record as the server has it", async () => {
    const { drafts, calls } = setup();
    drafts.change(1, edit("e2", { title: "Typed" }));
    expect(drafts.saved(1)!.entries[1].title).toBe("Two");
    const flushed = drafts.flush();
    await settle();
    calls[0].resolve({ entries: [section().entries[0], entry("e2", { title: "Stored" })] });
    await flushed;
    expect(drafts.saved(1)!.entries[1].title).toBe("Stored");
    expect(drafts.saved(9)).toBeUndefined();
  });
});

describe("flush", () => {
  it("resolves false if typing never stops", async () => {
    const { drafts, calls } = setup([section(), section({ id: 2 })]);
    const type = (id: number, title: string) => drafts.change(id, edit("e2", { title }));
    let result: boolean | null = null;
    type(1, "0");
    void drafts.flush().then((saved) => (result = saved));
    for (let round = 1; round < 200 && result === null; round += 1) {
      // The other section is done by now.
      type(round % 2 ? 2 : 1, String(round));
      calls.splice(0).forEach((call) => call.resolve());
      await settle();
    }
    expect(result).toBe(false);
  });
});

describe("setRecord", () => {
  it("keeps edits, and isn't undone by a save already on its way", async () => {
    const { drafts, calls, shown } = setup();
    drafts.change(1, edit("e2", { title: "Typed" }));
    await pause();
    drafts.setRecord(1, { base_items: { a: "new" } });
    expect(shown()).toMatchObject({ base_items: { a: "new" } });
    expect(shown().entries[1].title).toBe("Typed");
    calls[0].resolve({ base_items: {} });
    await pause();
    expect(shown().base_items).toEqual({ a: "new" });
    expect(drafts.saved(1)!.base_items).toEqual({ a: "new" });
    expect(drafts.saved(1)!.entries[1].title).toBe("Typed");
    expect(calls).toHaveLength(1);
  });
});
