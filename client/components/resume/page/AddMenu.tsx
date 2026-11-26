"use client";

import type { ChecklistSection } from "@/lib/resume/checklist";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { textStart } from "../ChecklistRow";
import type { AddPlace, CvEdits } from "../useCvEdits";

export type LeftOutItem = { id: string; text: string };

/** The entry a place adds into: its own, or under a heading the section's first, as addAt has it. */
const entryIdOf = (rows: ChecklistSection[], { sectionId, entryId }: AddPlace) =>
  entryId ?? rows.find((row) => row.sectionId === sectionId)?.entries.find(({ inCv }) => inCv)?.id ?? null;

/** The items of a place's entry that the CV has and leaves out. */
export const leftOutItems = (rows: ChecklistSection[], place: AddPlace): LeftOutItem[] => {
  const entryId = entryIdOf(rows, place);
  const entry = rows.find((row) => row.sectionId === place.sectionId)?.entries.find(({ id, inCv }) => id === entryId && inCv);
  return (entry?.items ?? []).filter(({ inCv, off }) => inCv && off).map(({ id, text }) => ({ id, text }));
};

interface AddMenuProps {
  place: AddPlace;
  rows: ChecklistSection[];
  edits: Pick<CvEdits, "addAt">;
  /** Ticks an item of the place's entry back on. */
  onPutBack: (entryId: string, itemId: string) => void;
  /** `back`: the focus goes back to the page. */
  onClose: (back: boolean) => void;
}

const ITEM = "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-[#fff4dc] focus-visible:bg-[#fff4dc]";

/** What a "+ Add" adds at its place. A plain list: no search. */
const AddMenu = ({ place, rows, edits, onPutBack, onClose }: AddMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [listing, setListing] = useState(false);
  const leftOut = leftOutItems(rows, place);
  const entryId = entryIdOf(rows, place);

  // Each list starts at its first item; not scrolled to, as it may not be placed yet.
  useEffect(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }), [listing]);

  const onKeyDown = (event: KeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const by = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (by !== undefined && all.length > 0) {
      event.preventDefault();
      all[(at + by + all.length) % all.length].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Not for a card or editor beneath.
      event.stopPropagation();
      onClose(true);
    }
  };

  const add = (what: "bullet" | "paragraph" | "entry") => {
    onClose(false);
    edits.addAt(place, what);
  };

  return (
    <div ref={menuRef} role="menu" aria-label={listing ? "Left-out bullets" : "What to add"} onKeyDown={onKeyDown} className="w-64">
      {listing && entryId !== null ? (
        leftOut.map(({ id, text }) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              onClose(true);
              onPutBack(entryId, id);
            }}
          >
            {textStart(text)}
          </button>
        ))
      ) : (
        <>
          <button type="button" role="menuitem" className={ITEM} onClick={() => add("bullet")}>
            Bullet
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => add("paragraph")}>
            Paragraph
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={() => add("entry")}>
            Entry{" "}
            <span aria-hidden className="ml-auto text-xs text-muted-foreground">
              title, role, dates
            </span>
          </button>
          {leftOut.length > 0 && (
            <>
              <div role="separator" className="my-1 border-t border-border" />
              <button type="button" role="menuitem" aria-haspopup="menu" className={ITEM} onClick={() => setListing(true)}>
                Put back a left-out bullet{" "}
                <span className="ml-auto text-xs text-muted-foreground">({leftOut.length})</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AddMenu;
