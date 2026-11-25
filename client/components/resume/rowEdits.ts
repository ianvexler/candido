import type { ChecklistEntry, ChecklistItem, ChecklistSection } from "@/lib/resume/checklist";
import { SUMMARY_ID } from "@/lib/types";
import type { EditTarget } from "./editChannel";

/** Its only entry, and without a title: items go right under the section. */
export const isBare = ({ entries }: ChecklistSection): boolean => {
  const [only] = entries;
  return (
    entries.length === 1 &&
    (only.items.length === 0 ? only.title === "Untitled" : only.items.some(({ text }) => text === only.title))
  );
};

/** Where a row's pencil goes, and whether what it goes to is in the CV. */
export type RowEdit = { target: EditTarget; ticked: boolean };

/** Null for what the CV has no copy of, or can't find. */
export const itemEdit = (
  sectionId: number | null,
  entryId: string,
  { id, inCv, ticked }: Pick<ChecklistItem, "id" | "inCv" | "ticked">
): RowEdit | null => {
  if (sectionId === null || !inCv || id === "") return null;
  const target: EditTarget =
    id === SUMMARY_ID ? { sectionId, entryId, what: "summary" } : { sectionId, entryId, what: "item", itemId: id };
  return { target, ticked };
};

/** To its title, or without one to its first text: the details, or a ticked item first. */
export const entryEdit = (sectionId: number | null, { id, inCv, ticked, has, items }: ChecklistEntry): RowEdit | null => {
  if (sectionId === null || !inCv) return null;
  const to = (what: "title" | "details"): RowEdit => ({ target: { sectionId, entryId: id, what }, ticked });
  if (has.title) return to("title");
  if (has.details) return to("details");
  const item = items.find((each) => each.ticked) ?? items.find((each) => each.inCv && each.id !== "");
  return (item && itemEdit(sectionId, id, item)) ?? to("title");
};
