"use client";

import type { ExportSection } from "@/lib/resume/exportDocument";
import { EyeOffIcon } from "lucide-react";
import { memo } from "react";
import IconAction from "../IconAction";
import { sourceOfEntry } from "./pageDocument";

export type HiddenPlace = { sectionId: number; entryId: string; itemIds: string[] };
/** Where the middle of it is, from the top of the sheets. */
export type HiddenMarkAt = { top: number; places: HiddenPlace[] };

/** Their height, and how near two can be without being one. */
export const MARK_SIZE = 24;

/** The first line of text of an element, or its box. */
const lineBox = (element: Element): DOMRect => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()].find(({ height }) => height > 0) ?? element.getBoundingClientRect();
};

const isShown = (element: Element | null): element is Element => element !== null && element.getBoundingClientRect().height > 0;

/** The item, or the nearest thing shown above it when all of it is hidden. */
const shownItem = (entry: Element, itemId: string): Element | null => {
  const item = itemId ? entry.querySelector(`[data-cv-item="${CSS.escape(itemId)}"]`) : entry.querySelector(".rc-body");
  const all = [...entry.querySelectorAll("[data-cv-item]")];
  const above = item ? all.slice(0, all.indexOf(item)).reverse() : [];
  const head = entry.querySelector('[data-block="head"]');
  return [item, ...above, head, entry].find(isShown) ?? null;
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
          places: [{ sectionId: section.id, entryId: shown.id, itemIds: [itemId] }],
        });
      });
    })
  );
  // Those that would overlap are one.
  return found
    .sort((a, b) => a.top - b.top)
    .reduce<HiddenMarkAt[]>((marks, mark) => {
      const last = marks[marks.length - 1];
      if (last && mark.top - last.top < MARK_SIZE) last.places.push(...mark.places);
      else marks.push(mark);
      return marks;
    }, []);
};

interface HiddenTextMarksProps {
  marks: HiddenMarkAt[];
  /** No room beside the sheet: within its margin, where there is no text. */
  inside: boolean;
  onShow: (places: HiddenPlace[]) => void;
}

/** Beside each item that has text the CV doesn't show. */
const HiddenTextMarks = memo(({ marks, inside, onShow }: HiddenTextMarksProps) =>
  marks.map(({ top, places }) => (
    <IconAction
      key={JSON.stringify(places)}
      label="Show hidden text"
      side="right"
      onClick={() => onShow(places)}
      className="absolute size-6 text-muted-foreground/70 print:hidden [&_svg]:size-3.5"
      style={{ top: top - MARK_SIZE / 2, left: inside ? 2 : -MARK_SIZE - 6 }}
    >
      <EyeOffIcon />
    </IconAction>
  ))
);
HiddenTextMarks.displayName = "HiddenTextMarks";

export default HiddenTextMarks;
