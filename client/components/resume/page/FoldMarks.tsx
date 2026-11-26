"use client";

import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { CSSProperties, KeyboardEvent, memo, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { foldKey, FoldAt, targetOf } from "./folds";
import { ToolMenu } from "./PageTools";

/** How much of each one's text its list shows. */
const LABEL_LENGTH = 80;
/** A mark's height, in screen px: it is drawn out of the page's scale. */
export const FOLD_HEIGHT = 24;
/** Room between a mark and its column's text, and between it and the sheet's edge, in screen px. */
const ROOM = 4;
const INSET = 2;

const cut = (text: string) => (text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH).trimEnd()}…` : text);

/** How wide a mark's words are at most, for a count of that many digits, in screen px. */
const wordsWidth = (count: number) => 60 + 8 * String(count).length;

/** Whether a fold of that many is beside the sheet, with that much room there, rather than in its margin. */
export const isBeside = (count: number, deskRoom: number) => deskRoom >= wordsWidth(count) + ROOM + INSET;

type Place = { style: CSSProperties; dir: "ltr" | "rtl"; compact: boolean };

/**
 * Beside the sheet, level with its place, when there is room there. Otherwise in its column's
 * margin, by the text: a count alone when its words would cover the text, and in a margin too
 * narrow even for that, against the sheet's edge, never past it. In screen px.
 */
export const placeOf = ({ top, side, line, items }: FoldAt, scale: number, sheetWidth: number, deskRoom: number): Place => {
  const y = top * scale - FOLD_HEIGHT / 2;
  const width = wordsWidth(items.length);
  if (isBeside(items.length, deskRoom)) {
    const out = `calc(100% + ${ROOM}px)`;
    return { style: side === "left" ? { top: y, right: out } : { top: y, left: out }, dir: "ltr", compact: false };
  }
  const left = side === "left" ? INSET : line.right * scale + ROOM;
  const room = Math.max(0, side === "left" ? line.left * scale - ROOM - INSET : sheetWidth * scale - INSET - left);
  // Too wide, `safe` puts it at the slot's start: on the right, right to left, so that is the sheet's edge.
  return { style: { top: y, left, width: room }, dir: side === "right" ? "rtl" : "ltr", compact: room < width };
};

const SLOT = "absolute flex h-[24px] [justify-content:safe_flex-end]";

// In px, not rem: the app's rem isn't 16px.
const MARK =
  "inline-flex h-[24px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-dashed px-[8px] text-[12px] leading-none";

interface FoldMarksProps {
  folds: FoldAt[];
  /** The page's; marks are placed by it from sheet units, at screen size. */
  scale: number;
  /** In sheet units. */
  sheetWidth: number;
  /** Room beside the sheet, in screen px. */
  deskRoom: number;
  actions: Pick<ChecklistActions, "tick">;
  /** The list was closed from the keyboard. */
  onClosed?: () => void;
}

/** Where the CV leaves things out, each run folded into a mark: `<n> left out`. */
const FoldMarks = memo(({ folds, scale, sheetWidth, deskRoom, actions, onClosed }: FoldMarksProps) => {
  // What it held when opened: it stays listed as each goes back, until closed.
  const [open, setOpen] = useState<FoldAt | null>(null);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const leftOut = new Set(folds.flatMap(({ items }) => items.map(foldKey)));
  const opened = open && new Set(open.items.map(foldKey));
  const openPlace = open && placeOf(open, scale, sheetWidth, deskRoom);
  const isOpen = (fold: FoldAt) => Boolean(opened && fold.items.some((item) => opened.has(foldKey(item))));

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus({ preventScroll: true });
  }, [open]);

  const close = (back: boolean) => {
    setOpen(null);
    if (back) onClosed?.();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const all = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [])];
    const by = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (by !== undefined && all.length > 0) {
      event.preventDefault();
      const at = all.indexOf(document.activeElement as HTMLElement);
      all[(at + by + all.length) % all.length].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  return (
    <>
      {folds.map((fold) => {
        const { top, left, right } = fold.line;
        const expanded = isOpen(fold);
        const place = placeOf(fold, scale, sheetWidth, deskRoom);
        const label = `${fold.items.length} left out`;
        return (
          // Only the mark takes the pointer; the gutter is drawn over it.
          <div key={foldKey(fold.items[0])} data-page-tools className="group pointer-events-none absolute inset-0 z-10 print:hidden">
            <div dir={place.dir} className={SLOT} style={place.style}>
              {/* Its tooltip never takes the pointer from the page. */}
              <Tooltip disableHoverableContent>
                <TooltipTrigger asChild>
                  <button
                    dir="ltr"
                    type="button"
                    data-fold-mark
                    aria-label={place.compact ? label : undefined}
                    aria-haspopup="menu"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : fold)}
                    className={cn(
                      MARK,
                      "pointer-events-auto border-[#c3c9cf] bg-white text-[#5f6770] outline-none hover:border-[#8a929a] hover:text-[#1f2328] focus-visible:border-[#8a929a] focus-visible:text-[#1f2328]",
                      place.compact && "w-[24px] px-0",
                      expanded && "border-[#8a929a] text-[#1f2328]"
                    )}
                  >
                    {place.compact ? fold.items.length : label}
                  </button>
                </TooltipTrigger>
                {place.compact && (
                  <TooltipContent side="top" data-page-tip className="pointer-events-none">
                    {label}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
            <div
              aria-hidden
              className="absolute hidden border-t border-dashed border-[#8a929a] group-has-[[data-fold-mark]:hover]:block group-has-[[data-fold-mark]:focus-visible]:block"
              style={{ top: top * scale - 0.5, left: left * scale, width: (right - left) * scale }}
            />
          </div>
        );
      })}
      {open && openPlace && (
        <>
          {/* Where it was opened: it stays there when the mark goes. */}
          <div aria-hidden dir={openPlace.dir} className={cn(SLOT, "pointer-events-none invisible")} style={openPlace.style}>
            <span ref={setAnchor} dir="ltr" className={cn(MARK, openPlace.compact && "w-[24px] px-0")}>
              {openPlace.compact ? open.items.length : `${open.items.length} left out`}
            </span>
          </div>
          <ToolMenu anchor={anchor} onClose={close} keepOpenOn="[data-fold-mark]">
            <div ref={listRef} role="menu" aria-label="Left out here" onKeyDown={onKeyDown} className="w-72">
              {open.items.map((item) => {
                const back = !leftOut.has(foldKey(item));
                return (
                  <button
                    key={foldKey(item)}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={back}
                    onClick={() => void actions.tick(targetOf(item), !back)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-[#fff4dc] focus-visible:bg-[#fff4dc]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border border-[#aab2ba] [&_svg]:size-2.5",
                        back && "border-[#1f2328] bg-[#1f2328] text-white"
                      )}
                    >
                      {back && <CheckIcon strokeWidth={3} />}
                    </span>
                    {cut(item.label)}
                  </button>
                );
              })}
            </div>
          </ToolMenu>
        </>
      )}
    </>
  );
});
FoldMarks.displayName = "FoldMarks";

export default FoldMarks;
