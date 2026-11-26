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

export const foldKey = ({ sectionId, entryId = "", itemId = "" }: Omit<Folded, "label">) => [sectionId, entryId, itemId].join(":");

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

/** A heading is its section's; an entry is its title line. */
type Shown = { kind: "header" } | BlockRef;
/** A column's content in print order: what it shows and, where it was, what it leaves out. */
type Part = { shown: Shown } | { folded: Folded };

const levelOf = ({ entryId, itemId }: Folded) => (itemId !== undefined ? "item" : entryId !== undefined ? "entry" : "section");
/** What a run can't reach past: its entry, its section, or its column. */
const parentOf = (folded: Folded) => {
  const level = levelOf(folded);
  return level === "item" ? `${folded.sectionId}:${folded.entryId}` : level === "entry" ? `${folded.sectionId}` : "";
};

const entryParts = (sectionId: number, entry: SectionEntry): Part[] => {
  const entryId = entry.id;
  const parts: Part[] = [{ shown: { sectionId, kind: "entry", entryId } }];
  if (entry.description?.trim()) {
    parts.push(
      entry.description_off
        ? { folded: { sectionId, entryId, itemId: SUMMARY_ID, label: "Summary" } }
        : { shown: { sectionId, kind: "summary", entryId } }
    );
  }
  itemsOf(entry.content).forEach(({ id, text, off }) => {
    // One without an id can't be ticked back, nor placed by.
    if (id === "") return;
    parts.push(off ? { folded: { sectionId, entryId, itemId: id, label: text } } : { shown: { sectionId, kind: "item", entryId, itemId: id } });
  });
  return parts;
};

/** Each column's parts. `byColumn`: the sidebar template's two; otherwise one. */
const partsOf = (sections: CurriculumSection[], byColumn: boolean): Map<string, Part[]> => {
  const columns = new Map<string, Part[]>();
  sections.forEach((section) => {
    const column = byColumn ? sectionColumn(section) : "main";
    if (!columns.has(column)) columns.set(column, [{ shown: { kind: "header" } }]);
    const parts = columns.get(column)!;
    const sectionId = section.id;
    if (isLeftOut(section)) {
      if (isWritten(section)) parts.push({ folded: { sectionId, label: section.section_type.trim() || "Untitled section" } });
      return;
    }
    parts.push({ shown: { sectionId, kind: "heading" } });
    section.entries
      .filter((entry) => !isEmptyEntry(entry))
      .forEach((entry) => {
        if (entry.hidden) parts.push({ folded: { sectionId, entryId: entry.id, label: entryLabel(entry) } });
        else parts.push(...entryParts(sectionId, entry));
      });
  });
  return columns;
};

type Placed = LeftOutRun & { column: string; from: number; to: number };

/** What a run follows: the shown item, entry or section before it at its own level. */
const afterOf = (parts: Part[], from: number, first: Folded): BlockRef | null => {
  const level = levelOf(first);
  for (let at = from - 1; at >= 0; at--) {
    const part = parts[at];
    if (!("shown" in part)) continue;
    const { shown } = part;
    if (shown.kind === "header") return null;
    if (level === "section") return { sectionId: shown.sectionId, kind: "heading" };
    if (level === "entry") return shown.kind === "heading" ? null : { sectionId: shown.sectionId, kind: "entry", entryId: shown.entryId };
    return shown;
  }
  return null;
};

/** Runs of left-out things side by side, with where each is in its column's parts. */
const placedRuns = (sections: CurriculumSection[], byColumn: boolean): { runs: Placed[]; columns: Map<string, Part[]> } => {
  const columns = partsOf(sections, byColumn);
  const runs: Placed[] = [];
  columns.forEach((parts, column) =>
    parts.forEach((part, at) => {
      if (!("folded" in part)) return;
      const last = runs[runs.length - 1];
      const before = parts[at - 1];
      const joins =
        last?.column === column &&
        last.to === at - 1 &&
        "folded" in before &&
        parentOf(before.folded) === parentOf(part.folded) &&
        levelOf(before.folded) === levelOf(part.folded);
      if (joins) {
        last.items.push(part.folded);
        last.to = at;
        return;
      }
      const { sectionId } = part.folded;
      runs.push({ after: afterOf(parts, at, part.folded), sectionId, items: [part.folded], column, from: at, to: at });
    })
  );
  return { runs, columns };
};

/**
 * Consecutive left-out items, entries and sections, each run after the shown block before it;
 * null after nothing: the top of its section, or of its column. `byColumn`: sections are in two
 * columns, and a left-out one follows the section before it in its own.
 */
export const leftOutRuns = (sections: CurriculumSection[], byColumn = false): LeftOutRun[] =>
  placedRuns(sections, byColumn).runs.map(({ after, sectionId, items }) => ({ after, sectionId, items }));

/** What ticks it back on. */
export const targetOf = ({ sectionId, entryId, itemId }: Folded): ChecklistTarget => ({
  sectionId,
  templateId: null,
  ...(entryId === undefined ? {} : { entryId }),
  ...(itemId === undefined ? {} : { itemId }),
  inCv: true,
});

/** A shown part's element on the page, if it printed. */
const elementOf = (root: HTMLElement, column: HTMLElement, shown: Shown): Element | null => {
  if (shown.kind === "header") return column.querySelector('[data-block="header"], .rc-header');
  const section = root.querySelector(`section[data-section-id="${shown.sectionId}"]`);
  if (!section) return null;
  if (shown.kind === "heading") return section.querySelector(".rc-heading");
  const entry = section.querySelector(`[data-entry-id="${CSS.escape(shown.entryId)}"]`);
  if (!entry) return null;
  if (shown.kind === "summary") return entry.querySelector(".rc-summary");
  if (shown.kind === "item") return entry.querySelector(`[data-cv-item="${CSS.escape(shown.itemId)}"]`);
  // Its title line: not the section heading the first entry's head holds, nor its summary.
  const head = entry.querySelector(".rc-section-head");
  return [...(head?.children ?? [])].filter((child) => !child.matches(".rc-heading, .rc-summary") && isShown(child)).pop() ?? null;
};

/** The nearest part that printed, walking from `from` by `by`. */
const printed = (root: HTMLElement, column: HTMLElement, parts: Part[], from: number, by: -1 | 1): Element | null => {
  for (let at = from; at >= 0 && at < parts.length; at += by) {
    const part = parts[at];
    if (!("shown" in part)) continue;
    const element = elementOf(root, column, part.shown);
    if (isShown(element)) return element;
  }
  return null;
};

/** Where each run of left-out things was on the page, for an element the marks are placed in. */
export const findFolds = (root: HTMLElement, scale: number, sections: CurriculumSection[]): FoldAt[] => {
  const base = root.getBoundingClientRect().top;
  const at = (y: number) => (y - base) / scale;
  const all = columnsOf(root);
  const byColumn = all.length > 1;
  const { runs, columns } = placedRuns(sections, byColumn);
  return runs.flatMap(({ items, column: name, from, to }): FoldAt[] => {
    const column = byColumn ? root.querySelector<HTMLElement>(name === "sidebar" ? ".rs-side" : ".rs-main") : all[0];
    if (!column) return [];
    const parts = columns.get(name)!;
    // What did print on either side, however far: what it is next to may not have.
    const above = printed(root, column, parts, from - 1, -1);
    const below = printed(root, column, parts, to + 1, 1);
    const fromY = above ? at(above.getBoundingClientRect().bottom) : null;
    const toY = below ? at(below.getBoundingClientRect().top) : null;
    const columnTop = () => at(column.getBoundingClientRect().top) + parseFloat(getComputedStyle(column).paddingTop || "0");
    // Across a page break the middle would be between the sheets: keep by the block above.
    const top =
      fromY === null ? (toY ?? columnTop()) : toY === null ? fromY : Math.min((fromY + toY) / 2, fromY + MARK_SIZE / 2);
    const { left, right, side } = columnEdges(root, scale, column);
    return [{ top, side, items, line: { top, left, right } }];
  });
};
