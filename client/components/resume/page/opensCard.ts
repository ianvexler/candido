import type { KeyboardEvent, MouseEvent } from "react";

interface Options {
  open: boolean;
  /** With the press, unless it was a key's. */
  onOpen: (event?: MouseEvent<HTMLElement>) => void;
}

/** Makes printed text a button that opens a card. */
export const opensCard = ({ open, onOpen }: Options) => ({
  role: "button",
  tabIndex: 0,
  "aria-haspopup": "dialog" as const,
  "aria-expanded": open,
  onClick: (event: MouseEvent<HTMLElement>) => {
    // Its text was being selected. `detail` is 0 for a click that isn't the pointer's.
    const selection = getSelection();
    if (event.detail > 0 && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
    onOpen(event.detail > 0 ? event : undefined);
  },
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!event.repeat) onOpen();
  },
});
