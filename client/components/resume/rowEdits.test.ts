import type { ChecklistEntry, ChecklistItem } from "@/lib/resume/checklist";
import { SUMMARY_ID } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { entryEdit, isBare, itemEdit } from "./rowEdits";

const item = (id: string, changes: Partial<ChecklistItem> = {}) => ({ id, text: id, inCv: true, ticked: true, ...changes }) as ChecklistItem;
const entry = (changes: Partial<ChecklistEntry> = {}) =>
  ({
    id: "a",
    inCv: true,
    ticked: true,
    title: "Untitled",
    has: { title: false, summary: false, details: false },
    items: [],
    ...changes,
  }) as ChecklistEntry;
const has = (changes: object) => ({ title: false, summary: false, details: false, ...changes });

describe("where a row's pencil goes", () => {
  it.each([
    ["its title", entry({ has: has({ title: true, details: true }), items: [item("x")] }), { what: "title" }],
    ["its role and dates", entry({ has: has({ details: true }), items: [item("x")] }), { what: "details" }],
    ["its first ticked item", entry({ items: [item("x", { ticked: false }), item("y")] }), { what: "item", itemId: "y" }],
    ["its summary", entry({ items: [item(SUMMARY_ID)] }), { what: "summary" }],
    ["its title to write one", entry(), { what: "title" }],
  ])("an entry's to %s", (_, row, wanted) => {
    expect(entryEdit(1, row)).toEqual({ target: { sectionId: 1, entryId: "a", ...wanted }, ticked: true });
  });

  it("asks for a tick first", () => {
    expect(entryEdit(1, entry({ items: [item("x", { ticked: false })] }))).toMatchObject({ ticked: false, target: { itemId: "x" } });
    expect(entryEdit(1, entry({ ticked: false, has: has({ title: true }) }))).toMatchObject({ ticked: false });
  });

  it("isn't there for what the CV has no copy of, or has no id", () => {
    expect(entryEdit(null, entry())).toBeNull();
    expect(entryEdit(1, entry({ inCv: false }))).toBeNull();
    expect(itemEdit(1, "a", item("x", { inCv: false }))).toBeNull();
    expect(itemEdit(1, "a", item(""))).toBeNull();
    expect(itemEdit(null, "a", item("x"))).toBeNull();
  });
});

it("a section is bare with one untitled entry", () => {
  const section = (...entries: ChecklistEntry[]) => ({ entries }) as Parameters<typeof isBare>[0];
  expect(isBare(section(entry()))).toBe(true);
  expect(isBare(section(entry({ title: "x", items: [item("x")] })))).toBe(true);
  expect(isBare(section(entry({ title: "Acme", items: [item("x")] })))).toBe(false);
  expect(isBare(section(entry(), entry({ id: "b" })))).toBe(false);
});
