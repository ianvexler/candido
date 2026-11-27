import { endsBeforeStart } from "@/lib/resume/sectionEntries";
import type { CurriculumSection, SectionEntry } from "@/lib/types";
import { createContext } from "react";
import { entryKey } from "./nearStore";

/** What a card is for. */
export type CardPlace = { kind: "contact" } | { kind: "entry"; sectionId: number; entryId: string };

/** Entry ids repeat across sections. */
export const cardKey = (place: CardPlace) =>
  place.kind === "contact" ? "contact" : entryKey(place.sectionId, place.entryId);

/** Opens cards from what they are for. */
export type Cards = {
  openKey: string | null;
  openCard: (place: CardPlace, field: string) => void;
};

export const CardsContext = createContext<Cards | null>(null);

const within = (root: Element | null, selectors: string[]) =>
  selectors.map((selector) => root?.querySelector<HTMLElement>(selector)).find(Boolean) ?? null;

/** What a card opens from, or what is nearest to where that was. */
export const cardAnchor = (root: Element | null, place: CardPlace): HTMLElement | null => {
  // Beside the sheets is outside the page itself.
  if (place.kind === "contact") return within(root?.parentElement ?? null, [".page-contact", "[data-add-contact]", ".rc-header"]);
  const section = within(root, [`[data-section-id="${place.sectionId}"]`]);
  const entry = within(section, [`[data-entry-id="${CSS.escape(place.entryId)}"]`]);
  return within(entry, [".page-line", '[data-block="head"]']) ?? entry ?? section;
};

/** An entry that is in the CV. */
export const entryAt = (sections: CurriculumSection[], sectionId: number, entryId: string): SectionEntry | null => {
  const section = sections.find(({ id }) => id === sectionId);
  if (!section || section.hidden) return null;
  return section.entries.find(({ id, hidden }) => id === entryId && !hidden) ?? null;
};

/** What is wrong with an entry's dates. */
export const datesProblem = (entry: SectionEntry, unfinished: boolean): string | null => {
  if (unfinished) return "A month isn't complete";
  return endsBeforeStart(entry) ? "The end month is before the start month" : null;
};

/** The part of "first · second" an offset is in. Without a first, the second. */
export const partAt = <T>(parts: { text: string; field: T }[], offset: number): T | null => {
  let end = 0;
  const shown = parts.filter(({ text }) => text);
  const found = shown.find(({ text }) => {
    end += text.length;
    if (offset <= end) return true;
    end += " · ".length;
    return false;
  });
  return (found ?? shown.at(-1))?.field ?? null;
};

/** Which character of an element a press is on. */
export const offsetAt = (element: Element, x: number, y: number): number | null => {
  const position = document.caretPositionFromPoint?.(x, y);
  const range = position ? null : document.caretRangeFromPoint?.(x, y);
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;
  if (!node || offset === undefined || !element.contains(node)) return null;
  // Its text is one node.
  return node.nodeType === Node.TEXT_NODE ? offset : 0;
};
