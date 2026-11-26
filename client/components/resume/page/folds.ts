import { itemsOf } from "@/lib/resume/checklist";
import { isLeftOut, sectionColumn } from "@/lib/resume/exportDocument";
import { isEmptyEntry } from "@/lib/resume/sectionEntries";
import type { ChecklistTarget } from "@/lib/resume/useCvChecklist";
import { CurriculumSection, SectionEntry, SUMMARY_ID } from "@/lib/types";
import { isShown, MARK_SIZE } from "./HiddenTextMarks";
import { columnsOf } from "./measureBlocks";
import { BlockRef, columnEdges } from "./pagePlaces";

/** Something the CV has and leaves out: a section, an entry, or an item or the summary of one. */
export type Folded = { sectionId: number; entryId?: string; itemId?: string; label: string };

/** A fold's mark, where the left-out things were; `line` is its gap, which the mark may have been moved off. */
export type FoldAt = {
  top: number;
  side: "left" | "right";
  items: Folded[];
  line: { top: number; left: number; right: number };
};

export type LeftOutRun = { after: BlockRef | null; sectionId: number; items: Folded[] };

/** The items of an entry that it leaves out, with text and an id to tick them back by. */
export const leftOutItemsOf = (entry: SectionEntry): { id: string; text: string }[] =>
  itemsOf(entry.content)
    .filter(({ id, off }) => off && id !== "")
    .map(({ id, text }) => ({ id, text }));

/** What the checklist calls it. */
const entryLabel = (entry: SectionEntry) =>
  [entry.title, entry.organization, entry.role, itemsOf(entry.content)[0]?.text].map((text) => text?.trim()).find(Boolean) ??
  "Untitled";

/** Shows something: blank ones don't print. */
const isWritten = (section: CurriculumSection) => Boolean(section.section_type.trim()) || section.entries.some((entry) => !isEmptyEntry(entry));

/** Each shown block of an entry in order, or what it leaves out. */
const entryParts = (sectionId: number, entry: SectionEntry): (BlockRef | Folded)[] => {
  const entryId = entry.id;
  const parts: (BlockRef | Folded)[] = [{ sectionId, kind: "entry", entryId }];
  if (entry.description?.trim()) {
    parts.push(entry.description_off ? { sectionId, entryId, itemId: SUMMARY_ID, label: "Summary" } : { sectionId, kind: "summary", entryId });
  }
  itemsOf(entry.content).forEach(({ id, text, off }) => {
    // One without an id can't be ticked back, nor placed by.
    if (id === "") return;
    parts.push(off ? { sectionId, entryId, itemId: id, label: text } : { sectionId, kind: "item", entryId, itemId: id });
  });
  return parts;
};

/** Runs of what is left out, one after another: each after the shown block before it. */
const runsOf = (sectionId: number, parts: (BlockRef | Folded)[], start: BlockRef | null = null): LeftOutRun[] => {
  const runs: LeftOutRun[] = [];
  let after = start;
  let run: Folded[] = [];
  const flush = () => {
    if (run.length > 0) runs.push({ after, sectionId, items: run });
    run = [];
  };
  parts.forEach((part) => {
    if ("label" in part) return void run.push(part);
    flush();
    after = part;
  });
  flush();
  return runs;
};

/**
 * Consecutive left-out items, entries and sections, each run after the shown block before it;
 * null after nothing: the top of its section, or of its column. `byColumn`: sections are in two
 * columns, and a left-out one follows the section before it in its own.
 */
export const leftOutRuns = (sections: CurriculumSection[], byColumn = false): LeftOutRun[] => {
  const runs: LeftOutRun[] = [];
  const pending = new Map<string, LeftOutRun>();
  const shownBefore = new Map<string, BlockRef>();
  const flushColumn = (column: string) => {
    const run = pending.get(column);
    if (run) runs.push(run);
    pending.delete(column);
  };

  sections.forEach((section) => {
    const column = byColumn ? sectionColumn(section) : "one";
    if (isLeftOut(section)) {
      if (!isWritten(section)) return;
      const item: Folded = { sectionId: section.id, label: section.section_type.trim() || "Untitled section" };
      const run = pending.get(column);
      if (run) run.items.push(item);
      else pending.set(column, { after: shownBefore.get(column) ?? null, sectionId: section.id, items: [item] });
      return;
    }
    flushColumn(column);
    shownBefore.set(column, { sectionId: section.id, kind: "heading" });

    const entries = section.entries.filter((entry) => !isEmptyEntry(entry));
    const parts = entries.map((entry): BlockRef | Folded =>
      entry.hidden ? { sectionId: section.id, entryId: entry.id, label: entryLabel(entry) } : { sectionId: section.id, kind: "entry", entryId: entry.id }
    );
    runs.push(...runsOf(section.id, parts));
    entries.filter((entry) => !entry.hidden).forEach((entry) => {
      const [title, ...rest] = entryParts(section.id, entry);
      runs.push(...runsOf(section.id, rest, title as BlockRef));
    });
  });
  [...pending.keys()].forEach(flushColumn);
  return runs;
};

/** What ticks it back on. */
export const targetOf = ({ sectionId, entryId, itemId }: Folded): ChecklistTarget => ({
  sectionId,
  templateId: null,
  ...(entryId === undefined ? {} : { entryId }),
  ...(itemId === undefined ? {} : { itemId }),
  inCv: true,
});

const firstShownAfter = (list: Element[], from: Element | null) => list.slice(from ? list.indexOf(from) + 1 : 0).find(isShown) ?? null;

/** The shown blocks a run sits between. */
const boundsOf = (root: HTMLElement, sections: CurriculumSection[], { after, sectionId, items }: LeftOutRun) => {
  const [{ entryId, itemId }] = items;
  const sectionOf = (id: number) => root.querySelector(`section[data-section-id="${id}"]`);

  if (entryId === undefined) {
    // Sections: between the one before it in its column and the next.
    const columns = columnsOf(root);
    const left = sections.find(({ id }) => id === sectionId);
    const column =
      columns.length > 1 && left ? root.querySelector<HTMLElement>(sectionColumn(left) === "sidebar" ? ".rs-side" : ".rs-main") : columns[0];
    if (!column) return null;
    const all = [...column.querySelectorAll("section[data-section-id]")];
    const above = after ? sectionOf(after.sectionId) : column.querySelector('[data-block="header"], .rc-header');
    return { above, below: firstShownAfter(all, after ? above : null) };
  }

  const section = after ? sectionOf(after.sectionId) : sectionOf(sectionId);
  if (!section) return null;
  if (itemId === undefined) {
    // Entries: between the entry before them and the next, or under the heading.
    const all = [...section.querySelectorAll("[data-entry-id]")];
    if (after?.kind !== "entry") return { above: section.querySelector(".rc-heading"), below: firstShownAfter(all, null) };
    const above = section.querySelector(`[data-entry-id="${CSS.escape(after.entryId)}"]`);
    return { above, below: firstShownAfter(all, above) };
  }

  // Items: between the title line, summary or item before them and the next item.
  const entry = section.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`);
  if (!entry || !after) return null;
  const all = [...entry.querySelectorAll("[data-cv-item]")];
  if (after.kind === "item") {
    const above = entry.querySelector(`[data-cv-item="${CSS.escape(after.itemId)}"]`);
    return { above, below: firstShownAfter(all, above) };
  }
  const above = entry.querySelector(after.kind === "summary" ? ".rc-summary" : '[data-block="head"]');
  return { above, below: firstShownAfter(all, null) };
};

/** Where each run of left-out things was on the page, for an element the marks are placed in. */
export const findFolds = (root: HTMLElement, scale: number, sections: CurriculumSection[]): FoldAt[] => {
  const base = root.getBoundingClientRect().top;
  const at = (y: number) => (y - base) / scale;
  const columns = columnsOf(root);
  return leftOutRuns(sections, columns.length > 1).flatMap((run): FoldAt[] => {
    const bounds = boundsOf(root, sections, run);
    const above = bounds && isShown(bounds.above) ? bounds.above : null;
    const below = bounds?.below ?? null;
    const near = above ?? below;
    const column = near && columns.find((each) => each.contains(near));
    if (!near || !column) return [];
    const from = above ? at(above.getBoundingClientRect().bottom) : null;
    const to = below ? at(below.getBoundingClientRect().top) : null;
    // Across a page break the middle would be between the sheets: keep by the block above.
    const top = from === null ? to! : to === null ? from : Math.min((from + to) / 2, from + MARK_SIZE / 2);
    const { left, right, side } = columnEdges(root, scale, column);
    return [{ top, side, items: run.items, line: { top, left, right } }];
  });
};
