import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { CurriculumSection } from "@/lib/types";
import { describe, expect, it, vi } from "vitest";
import { cardAnchor, cardKey, datesProblem, entryAt, partAt } from "./cardPlace";

// jsdom has none.
vi.stubGlobal("CSS", { escape: (text: string) => text });

const entry = (id: string, changes = {}) => ({ ...emptyEntry(), id, ...changes });
const section = (id: number, changes = {}) =>
  ({ id, section_type: "Work", hidden: false, entries: [entry("a")], ...changes }) as CurriculumSection;

describe("partAt", () => {
  const parts = [
    { text: "Engineer", field: "role" },
    { text: "Northwind", field: "organization" },
  ];
  it.each([
    [0, "role"],
    [8, "role"],
    [10, "organization"],
    [11, "organization"],
    [99, "organization"],
  ])("offset %i is in %s", (offset, field) => expect(partAt(parts, offset)).toBe(field));

  it("skips what isn't there", () => {
    expect(partAt([{ text: "", field: "role" }, parts[1]], 0)).toBe("organization");
    expect(partAt([], 0)).toBeNull();
  });
});

describe("entries with the same id in two sections", () => {
  it("have their own card and anchor", () => {
    const place = (sectionId: number) => ({ kind: "entry" as const, sectionId, entryId: "a" });
    expect(cardKey(place(1))).not.toBe(cardKey(place(2)));
    const root = document.createElement("div");
    root.innerHTML = [1, 2]
      .map((id) => `<section data-section-id="${id}"><div data-entry-id="a"><p class="page-line">${id}</p></div></section>`)
      .join("");
    expect(cardAnchor(root, place(2))?.textContent).toBe("2");
    root.querySelectorAll(".page-line")[1].remove();
    expect(cardAnchor(root, place(2))).toBe(root.querySelectorAll("[data-entry-id]")[1]);
  });
});

describe("entryAt", () => {
  it("has nothing for what is left out or gone", () => {
    expect(entryAt([section(1)], 1, "a")?.id).toBe("a");
    expect(entryAt([section(1, { hidden: true })], 1, "a")).toBeNull();
    expect(entryAt([section(1, { entries: [entry("a", { hidden: true })] })], 1, "a")).toBeNull();
    expect(entryAt([section(2)], 1, "a")).toBeNull();
  });
});

describe("datesProblem", () => {
  it("says what is wrong", () => {
    const backwards = entry("a", { start_date: "2022-01-01", end_date: "2021-01-01" });
    expect(datesProblem(backwards, false)).toBe("The end month is before the start month");
    expect(datesProblem(entry("a"), true)).toBe("A month isn't complete");
    expect(datesProblem({ ...backwards, current: true }, false)).toBeNull();
  });
});
