import { createMonthDrafts, MonthDraftsContext } from "@/lib/resume/monthDrafts";
import { emptyEntry } from "@/lib/resume/sectionEntries";
import type { SectionEntry } from "@/lib/types";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EntryMonths, useEntryMonths } from "./EntryDetails";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let months: EntryMonths;
let drafts: ReturnType<typeof createMonthDrafts>;
const ENTRY = { ...emptyEntry(), id: "a" };
const PLACE = { sectionId: 1, entryId: "a" };

const Fields = ({ entry, sectionId }: { entry: SectionEntry; sectionId: number }) => {
  Object.assign(globalThis, { shownMonths: useEntryMonths(entry, sectionId) });
  return null;
};
const show = (entry: SectionEntry = ENTRY, sectionId = 1) => {
  act(() => root.render(<MonthDraftsContext value={drafts}><Fields entry={entry} sectionId={sectionId} /></MonthDraftsContext>));
  months = (globalThis as unknown as { shownMonths: EntryMonths }).shownMonths;
};
/** As another view would. */
const showAnew = (entry: SectionEntry = ENTRY, sectionId = 1) => {
  act(() => root.unmount());
  root = createRoot(document.createElement("div"));
  show(entry, sectionId);
};
const type = (month: string) => {
  act(() => months.set("start", month));
  months = (globalThis as unknown as { shownMonths: EntryMonths }).shownMonths;
};

beforeEach(() => {
  drafts = createMonthDrafts();
  root = createRoot(document.createElement("div"));
  show();
});
afterEach(() => act(() => root.unmount()));

it("keeps a half-typed month for the next view, which says so", () => {
  type("2021-");
  showAnew();
  expect(months.start).toBe("2021-");
  expect(months.unfinished).toBe(true);
  expect(drafts.places()).toEqual([PLACE]);
});

it("keeps it for its section's entry only", () => {
  type("2021-");
  showAnew(ENTRY, 2);
  expect(months.start).toBe("");
});

it("lets go of a finished month", () => {
  type("2021-");
  show({ ...ENTRY, start_date: "2021-03-01" });
  expect(drafts.places()).toEqual([]);
});

it("lets go of it when the date is set elsewhere", () => {
  type("2021-");
  showAnew({ ...ENTRY, start_date: "2019-01-01" });
  expect(months.start).toBe("2019-01");
  expect(drafts.places()).toEqual([]);
});

it("drops it with its entry", () => {
  type("2021-");
  drafts.prune([{ id: 1, hidden: false, entries: [ENTRY] }]);
  expect(drafts.places()).toHaveLength(1);
  drafts.prune([{ id: 1, hidden: false, entries: [{ ...ENTRY, hidden: true }] }]);
  expect(drafts.places()).toEqual([]);
});

it("counts a half-picked month as unfinished until it is completed or gone", () => {
  expect(drafts.isUnfinished(PLACE)).toBe(false);
  act(() => months.setHalfPicked("end", true));
  expect(drafts.isUnfinished(PLACE)).toBe(true);
  act(() => months.setHalfPicked("end", false));
  expect(drafts.isUnfinished(PLACE)).toBe(false);
  act(() => months.setHalfPicked("end", true));
  showAnew();
  expect(drafts.isUnfinished(PLACE)).toBe(false);
  type("2021-");
  expect(drafts.isUnfinished(PLACE)).toBe(true);
});
