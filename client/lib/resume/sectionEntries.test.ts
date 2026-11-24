import { describe, expect, it } from "vitest";
import { cleanFields, emptyEntry, endsBeforeStart, entryTitles, isEmptyEntry, moveEntry } from "./sectionEntries";

const entry = (id: string, overrides = {}) => ({ ...emptyEntry(), id, title: id, ...overrides });

describe("moveEntry", () => {
  const entries = [entry("a"), entry("b"), entry("c")];
  const ids = (list: { id: string }[]) => list.map((item) => item.id).join("");

  it("swaps with the neighbour", () => {
    expect(ids(moveEntry(entries, "b", -1))).toBe("bac");
    expect(ids(moveEntry(entries, "b", 1))).toBe("acb");
  });

  it("stays put at either end or when unknown", () => {
    expect(moveEntry(entries, "a", -1)).toBe(entries);
    expect(moveEntry(entries, "c", 1)).toBe(entries);
    expect(moveEntry(entries, "x", 1)).toBe(entries);
  });
});

describe("cleanFields", () => {
  it("names a blank section and drops the end date of a current entry", () => {
    const fields = cleanFields(" ", [entry("a", { current: true, end_date: "2024-01-01" })]);
    expect(fields.section_type).toBe("Section");
    expect(fields.entries[0].end_date).toBeNull();
  });
});

it("isEmptyEntry is true only when nothing is written", () => {
  expect(isEmptyEntry(emptyEntry())).toBe(true);
  expect(isEmptyEntry({ ...emptyEntry(), content: "<p></p>", hidden: true })).toBe(true);
  expect(isEmptyEntry(entry("a"))).toBe(false);
});

it("endsBeforeStart ignores the end date of a current entry", () => {
  const dates = { start_date: "2024-01-01", end_date: "2023-01-01" };
  expect(endsBeforeStart(entry("a", dates))).toBe(true);
  expect(endsBeforeStart(entry("a", { ...dates, current: true }))).toBe(false);
});

it("entryTitles joins the titles there are", () => {
  expect(entryTitles({ entries: [entry("a"), entry("b", { title: " " }), entry("c")] })).toBe("a, c");
});
