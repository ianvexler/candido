import { CurriculumSection, SectionEntry, SectionTemplate } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { emptyEntry } from "./sectionEntries";
import type { SectionDraft } from "./sectionDrafts";
import { pullInto, sameText, valueIn } from "./transfer";

const li = (id: string, text: string, off = "") => `<li data-cv-item="${id}"${off}>${text}</li>`;
const OFF = ' data-cv-off="true"';
const entry = (id: string, content: string, changes: Partial<SectionEntry> = {}): SectionEntry => ({
  ...emptyEntry(),
  id,
  content,
  ...changes,
});
const section = (...entries: SectionEntry[]) => ({ id: 1, entries }) as CurriculumSection;

describe("valueIn", () => {
  const template = {
    entries: [entry("a", "", { title: "A" }), entry("b", `<ul>${li("x", "X", OFF)}</ul>`)],
  } as SectionTemplate;

  it("finds an item anywhere when told to, without its tick", () => {
    expect(valueIn(template, { entryId: "a", itemId: "x" }, true)).toBe(li("x", "X"));
    expect(valueIn(template, { entryId: "a", itemId: "x" })).toBeNull();
  });

  it("gives an entry's own fields", () =>
    expect(valueIn(template, { entryId: "a" })).toEqual({
      title: "A", role: null, organization: null, location: null, start_date: null, end_date: null, current: false,
    }));

  it("is null for what isn't there", () => {
    expect(valueIn(undefined, { entryId: "a" })).toBeNull();
    expect(valueIn(template, { entryId: "z" })).toBeNull();
    expect(valueIn(template, { entryId: "b", itemId: "z" })).toBeNull();
  });
});

describe("sameText", () => {
  it("ignores ticks and how markup is written", () =>
    expect(
      sameText(
        section(entry("a", `<ul>${li("x", '<span style="color:red">X</span>')}</ul>`)),
        section(entry("a", `<ul>${li("x", '<span style="color: red;">X</span>', OFF)}</ul>`)),
        { entryId: "a", itemId: "x" }
      )
    ).toBe(true));

  it("compares just the item, or the fields", () => {
    const before = section(entry("a", `<ul>${li("x", "X")}${li("y", "Y")}</ul>`));
    const after = section(entry("a", `<ul>${li("x", "X2")}${li("y", "Y")}</ul>`));
    expect(sameText(before, after, { entryId: "a", itemId: "y" })).toBe(true);
    expect(sameText(before, after, { entryId: "a", itemId: "x" })).toBe(false);
    expect(sameText(before, after, { entryId: "a" })).toBe(true);
    expect(sameText(before, section(entry("a", "", { role: "R" })), { entryId: "a" })).toBe(false);
  });
});

describe("pullInto", () => {
  const before = section(entry("a", `<ul>${li("x", "X", OFF)}${li("y", "Y")}</ul>`, { title: "T" }), entry("b", "<p>B</p>"));
  const pulled = section(entry("a", `<ul>${li("x", "Library", OFF)}${li("y", "Y")}</ul>`, { title: "T" }), entry("b", "<p>B</p>"));
  const x = { entryId: "a", itemId: "x" };

  it("puts the item in, keeping the rest and its tick as edited", () => {
    const latest = section(entry("a", `<ul>${li("x", "X")}${li("y", "Typed")}</ul>`, { title: "T2" }), entry("b", "<p>B2</p>"));
    expect(pullInto(latest, before, pulled, x)).toEqual({
      entries: [
        { ...latest.entries[0], content: `<ul>${li("x", "Library")}${li("y", "Typed")}</ul>` },
        latest.entries[1],
      ],
    });
  });

  it("changes nothing if the item itself was edited", () =>
    expect(pullInto(section(entry("a", `<ul>${li("x", "Typed")}</ul>`)), before, pulled, x)).toEqual({}));

  it("takes fields, keeping edited content", () => {
    const latest = section({ ...before.entries[0], content: "<p>Typed</p>" }, before.entries[1]);
    const withTitle = section({ ...before.entries[0], title: "Library" }, before.entries[1]);
    expect(pullInto(latest, before, withTitle, { entryId: "a" }).entries![0]).toMatchObject({
      title: "Library",
      content: "<p>Typed</p>",
    });
  });

  it("takes what became another kind of block if the entry wasn't edited", () => {
    const paragraph = section(entry("a", `<p data-cv-item="x"${OFF}>X</p><ul>${li("y", "Y")}</ul>`, { title: "T" }));
    const latest = section(before.entries[0], entry("b", "<p>B2</p>"));
    expect(pullInto(latest, before, paragraph, x).entries![0].content).toBe(paragraph.entries[0].content);
    const edited = section(entry("a", `<ul>${li("x", "X", OFF)}${li("y", "Typed")}</ul>`));
    expect(pullInto(edited, before, paragraph, x)).toEqual({});
  });
});

describe("an entry's summary", () => {
  const subject = { entryId: "a", itemId: "$summary" };
  const having = (description: string | null, title = "A"): SectionDraft =>
    ({ section_type: "Work", entries: [{ ...emptyEntry(), id: "a", title, description, description_off: true }] }) as SectionDraft;

  it("is compared as plain text, and null when blank", () => {
    expect(valueIn(having(" x <b> "), subject)).toBe(" x <b> ");
    expect(valueIn(having(" "), subject)).toBeNull();
    expect(sameText(having("<b>x</b>"), having("<i>x</i>"), subject)).toBe(false);
  });

  it("is pulled alone, with its tick, unless typed over meanwhile", () => {
    const pulled = having("Library", "Theirs");
    expect(pullInto(having("Mine", "Typed"), having("Mine"), pulled, subject).entries![0]).toMatchObject({
      description: "Library", title: "Typed", description_off: true,
    });
    expect(pullInto(having("Typed"), having("Mine"), pulled, subject)).toEqual({});
  });
});
