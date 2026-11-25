"use client";

import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { ReactNode, useRef } from "react";

export type RowMenuAction = { label: string; icon: ReactNode; onSelect: () => void };

interface RowMenuProps {
  label: string;
  /** What goes to a place in the CV, and takes the focus there. */
  actions?: RowMenuAction[];
  /** Given for what can be moved. */
  move?: { canMoveUp: boolean; canMoveDown: boolean; onMove: (by: -1 | 1) => void };
  children?: ReactNode;
}

/** A checklist row's options. Not modal: one that opens a dialog would leave the page ignoring the mouse. */
const RowMenu = ({ label, actions = [], move, children }: RowMenuProps) => {
  const chosen = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Options for ${label}`}
          className="size-[28px] text-muted-foreground hover:text-foreground [@media(hover:none)]:size-[40px]"
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          const run = chosen.current;
          if (!run) return;
          chosen.current = null;
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
