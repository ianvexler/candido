import { describe, expect, it } from "vitest";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { CurriculumSection } from "@/lib/types";
import { createPageSections, sourceOfEntry, sourceOfSection } from "./pageDocument";

const section = (id: number, content: string) =>
  ({ id, section_type: "Work", hidden: false, placement: null, entries: [{ ...emptyEntry(), id: "a", content }] }) as unknown as CurriculumSection;

describe("createPageSections", () => {
  const one = section(1, '<p data-cv-item="x">One <span data-cv-hidden="true">h</span></p>');
  const two = section(2, "<p>Two</p>");

  it("keeps what didn't change", () => {
    const build = createPageSections();
    const before = build([one, two], {});
    const after = build([one, section(2, "<p>Three</p>")], {});
    expect(after[0]).toBe(before[0]);
    expect(after[1].entries[0].html).toBe("<p>Three</p>");
    expect(build([one], { 1: { a: 3 } })[0]).not.toBe(before[0]);
  });

  it("says what they are made from", () => {
    const [shown] = createPageSections()([one], { 1: { a: 3 } });
    expect(sourceOfSection(shown)).toBe(one);
    expect(sourceOfEntry(shown.entries[0])).toEqual({ section: one, entry: one.entries[0], version: 3, hiding: ["x"] });
  });

  it("keeps an emptied entry while asked to", () => {
    const build = createPageSections();
    const empty = section(1, "");
    expect(build([empty], {})[0].entries).toEqual([]);
    expect(build([empty], {}, [{ sectionId: 1, entryId: "a" }])[0].entries).toHaveLength(1);
    expect(build([empty], {})[0].entries).toEqual([]);
  });
});
