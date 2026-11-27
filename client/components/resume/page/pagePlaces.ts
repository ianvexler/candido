import type { PaperSize } from "@/lib/types";
import type { AddPlace } from "../useCvEdits";
import { BlockPlace, isPadded } from "./breakRules";
import { isShown, lineBox } from "./HiddenTextMarks";
import { columnsOf, MeasuredBlock, measureColumn, printTop } from "./measureBlocks";
import { SHEET_GAP, SHEETS } from "./pageSize";

type Side = "left" | "right";

/** A block of the page that can be ticked. */
export type BlockRef = { sectionId: number } & (
  | { kind: "heading" }
  | { kind: "entry"; entryId: string }
  | { kind: "item"; entryId: string; itemId: string }
  | { kind: "summary"; entryId: string }
);

/** Where a "+ Section" goes: its hairline's y and its column's content edges, in sheet units. */
export type Gap = {
  afterSectionId: number | null;
  top: number;
  left: number;
  right: number;
  side: Side;
};

/**
 * A block under the pointer: its first line's top and height, its foot, where what "+" adds by it
 * goes (`aim`), and its column's content edges, in sheet units.
 */
export type PlacedBlock = BlockRef & { top: number; bottom: number; line: number; aim: number; left: number; right: number; side: Side };

/** The least a gap's hover area is, in screen px. */
export const LEAST_GAP = 16;
/** How far below a column's last section its "+ Section" reaches, in sheet px. */
const TRAIL = 24;

const sideOf = (element: Element): Side => (element.closest(".rs-main") ? "right" : "left");

type Spot = { top: number; bottom: number } & (
  | { kind: "header" }
  | { kind: "heading"; sectionId: number }
  | { kind: "entry"; sectionId: number; entryId: string }
  | { kind: "item"; sectionId: number; entryId: string; itemId: string }
);

/** A column's blocks from the root's top, with a heading apart from the entry head it sits in. */
const spotsOf = (blocks: MeasuredBlock[], base: number, origin: number, scale: number): Spot[] => {
  const spots: Spot[] = [];
  const topOf = (element: Element) => element.getBoundingClientRect().top / scale - origin;
  blocks.forEach((block) => {
    const bottom = block.bottom + base - origin;
    const top = block.key === null ? block.top + base - origin : printTop(block, scale, isPadded(block.key)) - origin;
    if (block.key === null) {
      if (block.element.matches('[data-block="header"]')) spots.push({ kind: "header", top, bottom });
      return;
    }
    const { sectionId: id, entryId, itemId, path } = JSON.parse(block.key) as BlockPlace;
    const sectionId = Number(id);
    if (entryId === null) return void spots.push({ kind: "heading", sectionId, top, bottom });
    if (itemId === null) {
      const heading = block.element.querySelector(":scope > .rc-heading");
      if (!heading || !isShown(heading)) return void spots.push({ kind: "entry", sectionId, entryId, top, bottom });
      const box = heading.getBoundingClientRect();
      spots.push({ kind: "heading", sectionId, top: topOf(heading), bottom: box.bottom / scale - origin });
      const rest = [...block.element.children].slice([...block.element.children].indexOf(heading) + 1).find(isShown);
      if (rest) spots.push({ kind: "entry", sectionId, entryId, top: topOf(rest), bottom });
      return;
    }
    // A quote's later blocks are still its item: no gap inside it.
    const last = spots[spots.length - 1];
    if (path && last?.kind === "item" && last.entryId === entryId && last.itemId === itemId) {
      last.bottom = bottom;
      return;
    }
    spots.push({ kind: "item", sectionId, entryId, itemId, top, bottom });
  });
  return spots;
};

/** Where "+" by a block adds: after an item; at the top of the entry's body by its title line or summary; at the top of the section by its heading. */
export const addPlaceOf = (block: BlockRef): AddPlace => {
  if (block.kind === "heading") return { sectionId: block.sectionId, entryId: null, after: null };
  return { sectionId: block.sectionId, entryId: block.entryId, after: block.kind === "item" ? block.itemId : null };
};

type Found = { afterSectionId: number | null; from: number; to: number; top: number };

type Sheets = { of: (y: number) => number; end: (sheet: number) => number };

/** Each "+ Section" in a column, with the y range that finds it: all of its gap, at least `least` about its middle. */
const placesOf = (spots: Spot[], sheets: Sheets, order: number[], least: number): Found[] => {
  const sheetOf = sheets.of;
  const pairs = spots.slice(1).map((below, index) => [spots[index], below] as const);
  const broken = ([above, below]: readonly [Spot, Spot]) => sheetOf(above.bottom) !== sheetOf(below.top);
  // A break's space says nothing of the gap: what the column's others are says it.
  const spaces = pairs.filter((pair) => !broken(pair)).map(([above, below]) => below.top - above.bottom).sort((a, b) => a - b);
  const normal = spaces.length > 0 ? spaces[Math.floor(spaces.length / 2)] : 0;
  const across = (afterSectionId: number | null, from: number, to: number, top: number): Found => ({
    afterSectionId,
    from: Math.min(from, top - least / 2),
    to: Math.max(to, top + least / 2),
    top,
  });

  const found: Found[] = [];
  // A column's first section follows the one before it in the CV, which may be in the other column.
  const first = spots.find((spot) => spot.kind !== "header");
  const before = first ? (order[order.indexOf(first.sectionId) - 1] ?? null) : null;
  if (first && spots[0] === first) found.push({ afterSectionId: before, from: first.top - least, to: first.top, top: first.top - least / 2 });
  pairs.forEach((pair) => {
    const [above, below] = pair;
    if (below.kind === "header" || (above.kind !== "header" && below.sectionId === above.sectionId)) return;
    // Never in the space between sheets.
    const top = broken(pair) ? below.top - normal / 2 : (above.bottom + below.top) / 2;
    found.push(across(above.kind === "header" ? before : above.sectionId, above.bottom, below.top, top));
  });
  const last = spots[spots.length - 1];
  if (last && last.kind !== "header") {
    // Not past its sheet's foot.
    const end = Math.min(last.bottom + Math.max(TRAIL, least), sheets.end(sheetOf(last.bottom)));
    found.push({ afterSectionId: last.sectionId, from: last.bottom, to: end, top: (last.bottom + end) / 2 });
  }
  return found;
};

/** The "+ Section" gap under the pointer, in the column it is over. `order` is the CV's section ids in order. */
export const gapAt = (root: HTMLElement, scale: number, clientX: number, clientY: number, order: number[]): Gap | null => {
  const column = columnsOf(root).find((each) => {
    const { left, right } = each.getBoundingClientRect();
    return clientX >= left && clientX <= right;
  });
  if (!column) return null;

  const box = root.getBoundingClientRect();
  const origin = box.top / scale;
  const y = clientY / scale - origin;
  const paper = root.querySelector("[data-paper]")?.getAttribute("data-paper") as PaperSize | null;
  const height = paper && SHEETS[paper] ? SHEETS[paper].height : Infinity;
  const sheets: Sheets = {
    of: (at) => Math.floor(at / (height + SHEET_GAP)),
    // Written so that without a paper there is one endless sheet.
    end: (sheet) => (sheet + 1) * (height + SHEET_GAP) - SHEET_GAP,
  };

  const { base, blocks } = measureColumn(column, scale);
  const spots = spotsOf(blocks, base, origin, scale);
  const hit = placesOf(spots, sheets, order, LEAST_GAP / scale).find(({ from, to }) => y >= from && y < to);
  if (!hit) return null;

  return { afterSectionId: hit.afterSectionId, top: hit.top, ...columnEdges(root, scale, column) };
};

/** A column's content edges, in sheet units, and its side. */
export const columnEdges = (root: HTMLElement, scale: number, column: HTMLElement) => {
  const box = root.getBoundingClientRect();
  const edges = column.getBoundingClientRect();
  const style = getComputedStyle(column);
  return {
    left: (edges.left - box.left) / scale + parseFloat(style.paddingLeft || "0"),
    right: (edges.right - box.left) / scale - parseFloat(style.paddingRight || "0"),
    side: sideOf(column),
  };
};

/** The innermost block containing `target`, where its first line starts and where it ends. The header has none. */
export const blockAt = (root: HTMLElement, scale: number, target: Element): PlacedBlock | null => {
  const section = target.closest("[data-section-id]");
  if (!section || !root.contains(section)) return null;
  const column = columnsOf(root).find((each) => each.contains(section));
  if (!column) return null;
  const sectionId = Number(section.getAttribute("data-section-id"));
  const entry = target.closest("[data-entry-id]");
  const entryId = entry && section.contains(entry) ? entry.getAttribute("data-entry-id") : null;
  const inEntry = (selector: string) => {
    const found = target.closest(selector);
    return found && entry?.contains(found) ? found : null;
  };

  let ref: BlockRef;
  let element: Element;
  let last: Element | null = null;
  // At the top of the entry's body: below its head, summary and all.
  let aimAt: Element | null = null;
  const heading = target.closest('.rc-heading, [data-block="heading"]');
  const item = inEntry("[data-cv-item]");
  const summary = inEntry(".rc-summary");
  if (heading && section.contains(heading)) {
    ref = { sectionId, kind: "heading" };
    element = heading;
  } else if (entry === null || entryId === null) {
    return null;
  } else if (item) {
    ref = { sectionId, kind: "item", entryId, itemId: item.getAttribute("data-cv-item")! };
    element = item;
  } else if (summary) {
    ref = { sectionId, kind: "summary", entryId };
    element = summary;
    aimAt = entry.querySelector('[data-block="head"]');
  } else {
    ref = { sectionId, kind: "entry", entryId };
    const head = entry.querySelector('[data-block="head"]');
    // Its title line and the role and dates under it: not the section heading the first entry's head holds, nor its summary.
    const lines = [...(head?.children ?? [])].filter((child) => !child.matches(".rc-heading, .rc-summary") && isShown(child));
    element = lines[0] ?? entry;
    last = lines[lines.length - 1] ?? null;
    aimAt = head;
  }
  // A line box: a block's own box has any break's padding, and its first child may be on a later line.
  const origin = root.getBoundingClientRect().top;
  const line = lineBox(element);
  const bottom = ((last ?? element).getBoundingClientRect().bottom - origin) / scale;
  const aim = isShown(aimAt) ? (aimAt.getBoundingClientRect().bottom - origin) / scale : bottom;
  return {
    ...ref,
    top: (line.top - origin) / scale,
    bottom,
    line: line.height / scale,
    aim: Math.max(aim, bottom),
    ...columnEdges(root, scale, column),
  };
};

/** The block level with the pointer when it is in a column's margin, between the sheet's edge and the text. */
export const blockBeside = (root: HTMLElement, scale: number, clientX: number, clientY: number): PlacedBlock | null => {
  const box = root.getBoundingClientRect();
  const x = (clientX - box.left) / scale;
  const width = box.width / scale;
  for (const column of columnsOf(root)) {
    const { top, bottom } = column.getBoundingClientRect();
    if (clientY < top || clientY > bottom) continue;
    const { left, right, side } = columnEdges(root, scale, column);
    if (side === "left" ? x < 0 || x >= left : x <= right || x > width) continue;
    // By the column's middle: lists and lines are indented, but their boxes are as wide as it.
    const probe = box.left + ((left + right) / 2) * scale;
    const target = document.elementsFromPoint(probe, clientY).find((each) => each !== root && root.contains(each));
    return target ? blockAt(root, scale, target) : null;
  }
  return null;
};
