"use client";

import { entryUnderHeading } from "@/lib/resume/sectionEntries";
import type { CurriculumSection } from "@/lib/types";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { textStart } from "../ChecklistRow";
import type { AddPlace, CvEdits } from "../useCvEdits";
import { leftOutItemsOf } from "./folds";

/** The entry a place adds into: its own, or under a heading the one addAt adds into. */
const entryOf = (sections: CurriculumSection[], { sectionId, entryId }: AddPlace) => {
  const entries = sections.find(({ id }) => id === sectionId)?.entries ?? [];
  return (entryId === null ? entryUnderHeading(entries) : entries.find(({ id }) => id === entryId)) ?? null;
};

/** The items of a place's entry that the CV has and leaves out. */
const leftOutItems = (sections: CurriculumSection[], place: AddPlace) => {
  const entry = entryOf(sections, place);
  return entry ? leftOutItemsOf(entry) : [];
};

interface AddMenuProps {
  place: AddPlace;
  /** The drafts. */
  sections: CurriculumSection[];
  edits: Pick<CvEdits, "addAt">;
  /** Ticks an item of the place's entry back on. */
  onPutBack: (entryId: string, itemId: string) => void;
  /** `back`: the focus goes back to the page. */
  onClose: (back: boolean) => void;
}

const ITEM = "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-[#fff4dc] focus-visible:bg-[#fff4dc]";

/** What a gutter's "+" adds at its place. A plain list: no search. */
const AddMenu = ({ place, sections, edits, onPutBack, onClose }: AddMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [listing, setListing] = useState(false);
  const leftOut = leftOutItems(sections, place);
  const entryId = entryOf(sections, place)?.id ?? null;

  // Each list starts at its first item; not scrolled to, as it may not be placed yet.
  useEffect(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }), [listing]);

  const onKeyDown = (event: KeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const by = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (by !== undefined && all.length > 0) {
      event.preventDefault();
      const next = all[(at + by + all.length) % all.length];
      // In a list taller than its room: to where it shows, and no further.
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
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
