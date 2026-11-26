"use client";

import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import { KeyboardEvent, memo, useEffect, useRef, useState } from "react";
import { foldKey, FoldAt, targetOf } from "./folds";
import { ToolMenu } from "./PageTools";

/** How much of each one's text its list shows. */
const LABEL_LENGTH = 80;
/** A mark's height, in sheet px; it sits in a MARK_SIZE slot. */
const HEIGHT = 20;
/** Room between a mark beside the sheet and the sheet. */
const OUT = 6;
/** Room between a mark in a margin and its column's text. */
const ROOM = 4;

const cut = (text: string) => (text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH).trimEnd()}…` : text);

/**
 * Beside the sheet; or, with no room there, against its column's text, never over it: a margin
 * can be narrower than the mark, which then reaches past the sheet's edge.
 */
const placeOf = ({ top, side, line }: FoldAt, inside: boolean) => {
  const y = top - HEIGHT / 2;
  if (inside) {
    return side === "left"
      ? { className: "-translate-x-full", style: { top: y, left: line.left - ROOM } }
      : { className: "", style: { top: y, left: line.right + ROOM } };
  }
  return { className: side === "left" ? "-translate-x-full" : "translate-x-full", style: { top: y, [side]: -OUT } };
};

interface FoldMarksProps {
  folds: FoldAt[];
  /** No room beside the sheet: within its margin. */
  inside: boolean;
  actions: Pick<ChecklistActions, "tick">;
  /** The list was closed from the keyboard. */
  onClosed?: () => void;
}

/** Where the CV leaves things out, each run folded into a mark: `<n> left out`. */
const FoldMarks = memo(({ folds, inside, actions, onClosed }: FoldMarksProps) => {
  // What it held when opened: it stays listed as each goes back, until closed.
  const [open, setOpen] = useState<FoldAt | null>(null);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const leftOut = new Set(folds.flatMap(({ items }) => items.map(foldKey)));
  const opened = open && new Set(open.items.map(foldKey));
  const anchorAt = open && placeOf(open, inside);
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
        const { className, style } = placeOf(fold, inside);
        const expanded = isOpen(fold);
        return (
          // Over the sidebar template's columns, which are stacked; only the mark takes the pointer.
          <div key={foldKey(fold.items[0])} data-page-tools className="pointer-events-none absolute inset-0 z-10 print:hidden">
            <button
              type="button"
              data-fold-mark
              aria-haspopup="menu"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : fold)}
              className={cn(
                "peer pointer-events-auto absolute h-5 whitespace-nowrap rounded-full border border-dashed border-[#c3c9cf] bg-white px-1.5 text-[10px]/[18px] text-[#5f6770] outline-none hover:border-[#8a929a] hover:text-[#1f2328] focus-visible:border-[#8a929a] focus-visible:text-[#1f2328]",
                expanded && "border-[#8a929a] text-[#1f2328]",
                className
              )}
              style={style}
            >
              {fold.items.length} left out
            </button>
            <div
              aria-hidden
              className="absolute hidden border-t border-dashed border-[#8a929a] peer-hover:block peer-focus-visible:block"
              style={{ top: top - 0.5, left, width: right - left }}
            />
          </div>
        );
      })}
      {open && (
        <>
          {/* Where it was opened: it stays there when the mark goes. */}
          <span ref={setAnchor} aria-hidden className={cn("pointer-events-none absolute h-5 w-0", anchorAt?.className)} style={anchorAt?.style} />
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
