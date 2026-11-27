"use client";

import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { ComponentProps, ReactNode, useEffect, useRef, useState } from "react";

export type RowMenuAction = { label: string; icon: ReactNode; onSelect: () => void };

interface RowMenuProps {
  label: string;
  /** What goes to a place in the CV, and takes the focus there. */
  actions?: RowMenuAction[];
  /** Given for what can be moved. */
  move?: { canMoveUp: boolean; canMoveDown: boolean; onMove: (by: -1 | 1) => void };
  children?: ReactNode;
  /** Where focus goes as it closes, when not back to its button. */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Only a plain button until it is pointed at, focused or pressed. For long
   * lists, where a menu on every row is slow to mount.
   */
  lazy?: boolean;
}

const TriggerButton = ({ label, ...props }: { label: string } & ComponentProps<typeof Button>) => (
  <Button
    type="button"
    variant="ghost"
    size="icon-sm"
    aria-label={`Options for ${label}`}
    aria-haspopup="menu"
    className="size-[28px] text-muted-foreground hover:text-foreground [@media(hover:none)]:size-[40px]"
    {...props}
  >
    <EllipsisIcon />
  </Button>
);

/** How a lazy menu was woken: by focus it takes the focus; pressed, it opens (and the menu takes focus). */
type Armed = null | "pointer" | "focus" | "press";

/** A checklist row's options. Not modal: one that opens a dialog would leave the page ignoring the mouse. */
const RowMenu = ({ label, actions = [], move, children, onCloseAutoFocus, lazy = false }: RowMenuProps) => {
  const [armed, setArmed] = useState<Armed>(lazy ? null : "pointer");
  const trigger = useRef<HTMLButtonElement>(null);
  const chosen = useRef<(() => void) | null>(null);
  const run = () => {
    const action = chosen.current;
    chosen.current = null;
    action?.();
  };
  // Its row may go as it closes, as with what was being added.
  useEffect(
    () => () => {
      setTimeout(run);
    },
    []
  );
  // The plain button that had focus is gone.
  useEffect(() => {
    if (armed === "focus") trigger.current?.focus();
  }, [armed]);

  if (armed === null) {
    return (
      <TriggerButton
        label={label}
        aria-expanded={false}
        onPointerEnter={() => setArmed("pointer")}
        onFocus={() => setArmed("focus")}
        // A tap can come before the menu was woken by pointing.
        onClick={() => setArmed("press")}
      />
    );
  }

  return (
    <DropdownMenu modal={false} defaultOpen={armed === "press"}>
      <DropdownMenuTrigger asChild>
        <TriggerButton ref={trigger} label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!chosen.current) {
            onCloseAutoFocus?.(event);
            return;
          }
          // Only now that the menu is done with the focus.
          event.preventDefault();
          run();
        }}
      >
        {actions.map(({ label: name, icon, onSelect }) => (
          <DropdownMenuItem
            key={name}
            onSelect={() => {
              chosen.current = onSelect;
            }}
          >
            {icon}
            {name}
          </DropdownMenuItem>
        ))}
        {actions.length > 0 && (move || children) && <DropdownMenuSeparator />}
        {move && (
          <>
            <DropdownMenuItem disabled={!move.canMoveUp} onSelect={() => move.onMove(-1)}>
              <ArrowUpIcon />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!move.canMoveDown} onSelect={() => move.onMove(1)}>
              <ArrowDownIcon />
              Move down
            </DropdownMenuItem>
          </>
        )}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RowMenu;
