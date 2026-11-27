import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/lib/resume/checklist";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import { CurriculumSection, SectionEntry, SectionTemplate } from "@/lib/types";
import { deletionNote } from "./removeSection";

const p = (id: string, text: string) => `<p data-cv-item="${id}">${text}</p>`;
const entry = (id: string, content: string, changes: Partial<SectionEntry> = {}): SectionEntry => ({
  ...emptyEntry(),
  id,
  title: "Job",
  content,
  ...changes,
});
const library = [{ id: 10, section_type: "Work", item_added_at: {}, entries: [entry("a", p("x", "X"))] }] as unknown as SectionTemplate[];

const row = (entries: SectionEntry[], changes: Partial<CurriculumSection> = {}, templates = library) =>
  buildChecklist(
    [{ id: 1, section_type: "Work", section_template_id: 10, hidden: false, base_items: {}, base_fields: {}, entries, ...changes } as CurriculumSection],
    templates,
    "2026-11-01T00:00:00.000Z"
  )[0];

const KEPT = "Only this CV's copy is removed. The section stays in your library.";
const SOME = "Some of this text is only in this CV and will be deleted. To keep it, untick it instead.";
const ALL = "This text is only in this CV and will be deleted. To keep it, untick it instead.";
const ENTRY_KEPT = "Only this CV's copy is deleted. To keep it here but not show it, untick it instead.";
const edited = entry("a", p("x", "Mine"));

describe("deletionNote of a section", () => {
  it.each([
    ["all in the library", row([entry("a", p("x", "X"))]), KEPT],
    ["with less than the library", row([entry("a", "")]), KEPT],
    ["with a blank entry", row([entry("a", p("x", "X")), emptyEntry()]), KEPT],
    ["with hidden text", row([entry("a", p("x", '<span data-cv-hidden="true">X</span>'))]), KEPT],
    ["behind the library", row([edited], { base_items: { x: p("x", "Mine") } }), KEPT],
    ["edited", row([edited], { base_items: { x: p("x", "X") } }), SOME],
    ["changed on both sides", row([edited], { base_items: { x: p("x", "Z") } }), SOME],
    ["differing", row([edited]), SOME],
    ["with other fields", row([entry("a", p("x", "X"), { role: "Lead" })]), SOME],
    ["with its own item", row([entry("a", p("x", "X") + p("o", "O"))]), SOME],
    ["with its own unticked item", row([entry("a", p("x", "X") + '<p data-cv-item="o" data-cv-off="true">O</p>')]), SOME],
    ["with its own entry", row([entry("a", p("x", "X")), entry("b", "")]), SOME],
    ["without a library section", row([edited], { section_template_id: null }), ALL],
  ])("%s", (_, section, note) => expect(deletionNote(section, true)).toBe(note));

  it("promises nothing without the library", () => {
    expect(deletionNote(row([edited], {}, []), false)).toBe(SOME);
    expect(deletionNote(undefined, true)).toBe(SOME);
    expect(deletionNote(row([edited], { section_template_id: null }, []), false)).toBe(ALL);
  });
});

describe("deletionNote of an entry", () => {
  const section = row([entry("a", p("x", "X")), entry("b", p("o", "O")), entry("c", p("x2", "X"))]);

  it("goes by that entry", () => {
    expect(deletionNote(section, true, "a")).toBe(ENTRY_KEPT);
    expect(deletionNote(row([edited]), true, "a")).toBe(SOME);
    expect(deletionNote(section, true, "b")).toBe(ALL);
    expect(deletionNote(section, true, "gone")).toBe(SOME);
    expect(deletionNote(section, false, "a")).toBe(SOME);
    expect(deletionNote(row([edited], { section_template_id: null }), true, "a")).toBe(ALL);
  });
});
