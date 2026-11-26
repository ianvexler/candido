import type { PaperSize } from "@/lib/types";
import type { AddPlace } from "../useCvEdits";
import { BlockPlace, isPadded } from "./breakRules";
import { MeasuredBlock, measureColumns, printTop } from "./measureBlocks";
import { SHEET_GAP, SHEETS } from "./pageSize";

type Side = "left" | "right";

/** A block of the page that can be ticked. */
export type BlockRef = { sectionId: number } & (
  | { kind: "heading" }
  | { kind: "entry"; entryId: string }
  | { kind: "item"; entryId: string; itemId: string }
  | { kind: "summary"; entryId: string }
);

/** Where something can be added, its hairline's y and its column's content edges, in sheet units. */
export type Gap = GapKind & {
  top: number;
  left: number;
  right: number;
  side: Side;
};

type GapKind = { kind: "add"; place: AddPlace } | { kind: "section"; afterSectionId: number | null };

/** How near the pointer has to be to a gap, in sheet px. */
export const HIT = 6;
/** How far below a column's last section its add points reach. */
const TRAIL = 24;

const sideOf = (element: Element): Side => (element.closest(".rs-main") ? "right" : "left");

/** As measureColumns finds them, in the same order. */
const columnsOf = (root: HTMLElement): HTMLElement[] => {
  const found = [...root.querySelectorAll<HTMLElement>(".rs-side, .rs-main")];
  return found.length > 0 ? found : [...root.querySelectorAll<HTMLElement>(".resume-classic")];
};

const isShown = (element: Element) => element.getBoundingClientRect().height > 0;
const firstShown = (element: Element): Element => [...element.children].find(isShown) ?? element;

/** The page's own scale, from its box and its unscaled width. */
const scaleOf = (root: HTMLElement): number => {
  const width = root.offsetWidth;
  return width > 0 ? root.getBoundingClientRect().width / width : 1;
};

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

const placeAfter = (spot: Exclude<Spot, { kind: "header" }>): AddPlace => {
  if (spot.kind === "heading") return { sectionId: spot.sectionId, entryId: null, after: null };
  return { sectionId: spot.sectionId, entryId: spot.entryId, after: spot.kind === "item" ? spot.itemId : null };
};

type Found = { gap: GapKind; from: number; to: number; top: number };

/** Each place in a column the pointer can be at, with the y range that finds it. */
const placesOf = (spots: Spot[], sheetOf: (y: number) => number): Found[] => {
  const pairs = spots.slice(1).map((below, index) => [spots[index], below] as const);
  const broken = ([above, below]: readonly [Spot, Spot]) => sheetOf(above.bottom) !== sheetOf(below.top);
  // A break's space says nothing of the gap: what the column's others are says it.
  const spaces = pairs.filter((pair) => !broken(pair)).map(([above, below]) => below.top - above.bottom).sort((a, b) => a - b);
  const normal = spaces.length > 0 ? spaces[Math.floor(spaces.length / 2)] : 0;

  const found: Found[] = [];
  pairs.forEach((pair) => {
    const [above, below] = pair;
    // Never in the space between sheets.
    const top = broken(pair) ? below.top - normal / 2 : (above.bottom + below.top) / 2;
    if (above.kind === "header") {
      found.push({ gap: { kind: "section", afterSectionId: null }, from: top - HIT, to: top + HIT, top });
    } else if (below.kind !== "header" && below.sectionId === above.sectionId) {
      found.push({ gap: { kind: "add", place: placeAfter(above) }, from: top - HIT, to: top + HIT, top });
    } else {
      found.push({ gap: { kind: "add", place: placeAfter(above) }, from: top - HIT, to: top, top });
      found.push({ gap: { kind: "section", afterSectionId: above.sectionId }, from: top, to: top + HIT, top });
    }
  });
  const last = spots[spots.length - 1];
  if (last && last.kind !== "header") {
    const top = last.bottom + TRAIL / 2;
    found.push({ gap: { kind: "add", place: placeAfter(last) }, from: last.bottom, to: top, top });
    found.push({ gap: { kind: "section", afterSectionId: last.sectionId }, from: top, to: last.bottom + TRAIL, top });
  }
  return found;
};

/** The gap under the pointer, in the column it is over. */
export const gapAt = (root: HTMLElement, scale: number, clientX: number, clientY: number): Gap | null => {
  const box = root.getBoundingClientRect();
  const origin = box.top / scale;
  const y = clientY / scale - origin;
  const paper = root.querySelector("[data-paper]")?.getAttribute("data-paper") as PaperSize | null;
  const sheet = paper && SHEETS[paper] ? SHEETS[paper].height + SHEET_GAP : Infinity;
  const sheetOf = (at: number) => Math.floor(at / sheet);

  const columns = columnsOf(root);
  const measured = measureColumns(root, scale);
  const index = columns.findIndex((column) => {
    const { left, right } = column.getBoundingClientRect();
    return clientX >= left && clientX <= right;
  });
  if (index < 0 || !measured[index]) return null;

  const column = columns[index];
  const { base, blocks } = measured[index];
  const hit = placesOf(spotsOf(blocks, base, origin, scale), sheetOf).find(({ from, to }) => y >= from && y < to);
  if (!hit) return null;

  const edges = column.getBoundingClientRect();
  const style = getComputedStyle(column);
  return {
    ...hit.gap,
    top: hit.top,
    left: (edges.left - box.left) / scale + parseFloat(style.paddingLeft || "0"),
    right: (edges.right - box.left) / scale - parseFloat(style.paddingRight || "0"),
    side: sideOf(column),
  };
};

/** The innermost block containing `target`, and where its first line starts. The header has none. */
export const blockAt = (root: HTMLElement, target: Element): (BlockRef & { top: number; side: Side }) | null => {
  const section = target.closest("[data-section-id]");
  if (!section || !root.contains(section)) return null;
  const sectionId = Number(section.getAttribute("data-section-id"));
  const entry = target.closest("[data-entry-id]");
  const entryId = entry && section.contains(entry) ? entry.getAttribute("data-entry-id") : null;
  const inEntry = (selector: string) => {
    const found = target.closest(selector);
    return found && entry?.contains(found) ? found : null;
  };

  let ref: BlockRef;
  let element: Element;
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
    element = firstShown(item);
  } else if (summary) {
    ref = { sectionId, kind: "summary", entryId };
    element = summary;
  } else {
    ref = { sectionId, kind: "entry", entryId };
    const head = entry.querySelector('[data-block="head"]');
    // Its title line, not the section heading the first entry's head holds.
    element = (head && [...head.children].find((child) => !child.matches(".rc-heading") && isShown(child))) ?? entry;
  }
  const scale = scaleOf(root);
  const top = (element.getBoundingClientRect().top - root.getBoundingClientRect().top) / scale;
  return { ...ref, top, side: sideOf(section) };
};
