"use client";

import type { ExportSection } from "@/lib/resume/exportDocument";
import { EyeOffIcon } from "lucide-react";
import { memo } from "react";
import IconAction from "../IconAction";
import type { FoldAt } from "./folds";
import type { HiddenPlace } from "./hiddenText";
import { sourceOfEntry } from "./pageDocument";

/** Where the middle of it is, from the top of the sheets, and the edge its column is nearest. */
export type HiddenMarkAt = { top: number; side: "left" | "right"; places: HiddenPlace[] };

/** Their height, and how near two can be without being one. */
export const MARK_SIZE = 24;

/** Less than any gap that matters, more than any rounding. */
export const HAIR = 1e-6;

/** The first line of text of an element, or its box. */
export const lineBox = (element: Element): DOMRect => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()].find(({ height }) => height > 0) ?? element.getBoundingClientRect();
};

export const isShown = (element: Element | null): element is Element => element !== null && element.getBoundingClientRect().height > 0;

/** The item, or the nearest thing shown above it when all of it is hidden. */
const shownItem = (entry: Element, itemId: string): Element | null => {
  const item = itemId ? entry.querySelector(`[data-cv-item="${CSS.escape(itemId)}"]`) : entry.querySelector(".rc-body");
  const all = [...entry.querySelectorAll("[data-cv-item]")];
  const above = item ? all.slice(0, all.indexOf(item)).reverse() : [];
  const head = entry.querySelector('[data-block="head"]');
  return [item, ...above, head, entry].find(isShown) ?? null;
};

/** The nearest middle at or below `from` that is `size` or more from each of `others`. */
export const freeBelow = (from: number, others: number[], size: number) => {
  let at = from;
  // Less a hair: a fraction added and taken away may come back a hair short, and find the same one again.
  const near = () => others.find((other) => Math.abs(other - at) < size - HAIR);
  for (let other = near(); other !== undefined; other = near()) at = other + size;
  return at;
};

/** The middle nearest `from`, above or below, within `low` to `high` and `size` or more from each of `others`; null without one. */
export const freeWithin = (from: number, others: number[], size: number, low: number, high: number) => {
  const isFree = (at: number) => others.every((other) => Math.abs(other - at) >= size - HAIR);
  const near = [from, ...others.flatMap((other) => [other - size, other + size])]
    .filter((at) => at >= low && at <= high && isFree(at))
    .sort((a, b) => Math.abs(a - from) - Math.abs(b - from));
  return near[0] ?? null;
};

export const isHiddenMark =(mark: HiddenMarkAt | FoldAt): mark is HiddenMarkAt => "places" in mark;

/**
 * Hidden-text marks that would overlap as one, each by its text; then each fold in the nearest
 * free place at or below its own, so it never covers another mark. `foldSize`: how far a fold's
 * middle is kept from another's, in sheet units; folds are drawn at screen size.
 */
export const mergeMarks = <T extends HiddenMarkAt | FoldAt>(marks: T[], foldSize = MARK_SIZE): T[] => {
  const merged: T[] = [];
  const byTop = [...marks].sort((a, b) => a.top - b.top);
  byTop.forEach((mark) => {
    if (!isHiddenMark(mark)) return;
    const last = merged.findLast(({ side }) => side === mark.side) as HiddenMarkAt | undefined;
    if (last && mark.top - last.top < MARK_SIZE) last.places = [...last.places, ...mark.places];
    else merged.push({ ...mark });
  });
  byTop
    .filter((mark) => !isHiddenMark(mark))
    .forEach((mark) => {
      const others = merged.filter(({ side }) => side === mark.side).map(({ top }) => top);
      merged.push({ ...mark, top: freeBelow(mark.top, others, foldSize) });
    });
  return merged.sort((a, b) => a.top - b.top);
};

/** Where the sections' hidden text is, for an element the marks are placed in. */
export const findHiddenMarks = (root: HTMLElement, scale: number, sections: ExportSection[]): HiddenMarkAt[] => {
  const found: HiddenMarkAt[] = [];
  const base = root.getBoundingClientRect().top;
  sections.forEach((section) =>
    section.entries.forEach((shown) => {
      const hiding = sourceOfEntry(shown)?.hiding ?? [];
      if (hiding.length === 0) return;
      const entry = root.querySelector(`[data-section-id="${section.id}"] [data-entry-id="${CSS.escape(shown.id)}"]`);
      if (!entry) return;
      new Set(hiding).forEach((itemId) => {
        const item = shownItem(entry, itemId);
        if (!item) return;
        const { top, height } = lineBox(item);
        found.push({
          top: (top + height / 2 - base) / scale,
          side: entry.closest(".rs-main") ? "right" : "left",
          places: [{ sectionId: section.id, entryId: shown.id, itemIds: [itemId] }],
        });
      });
    })
  );
  return mergeMarks(found);
};

interface HiddenTextMarksProps {
  marks: HiddenMarkAt[];
  /** No room beside the sheet: within its margin, where there is no text. */
  inside: boolean;
  onShow: (places: HiddenPlace[]) => void;
}

/** Beside each item that has text the CV doesn't show. */
const HiddenTextMarks = memo(({ marks, inside, onShow }: HiddenTextMarksProps) =>
  marks.map(({ top, side, places }) => (
    <IconAction
      key={JSON.stringify(places)}
      label="Show hidden text"
      side={side}
      onClick={() => onShow(places)}
      className="absolute z-10 size-6 text-muted-foreground/70 print:hidden [&_svg]:size-3.5"
      style={{ top: top - MARK_SIZE / 2, [side]: inside ? 2 : -MARK_SIZE - 6 }}
    >
      <EyeOffIcon />
    </IconAction>
  ))
);
HiddenTextMarks.displayName = "HiddenTextMarks";

export default HiddenTextMarks;
