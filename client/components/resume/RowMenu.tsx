"use client";

import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon } from "lucide-react";
import { ReactNode } from "react";

interface RowMenuProps {
  label: string;
  /** Given for what can be moved. */
  move?: { canMoveUp: boolean; canMoveDown: boolean; onMove: (by: -1 | 1) => void };
  children?: ReactNode;
}

/** A checklist row's options. */
const RowMenu = ({ label, move, children }: RowMenuProps) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Options for ${label}`}
        className="mt-0.5 size-6 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <EllipsisIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
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

export default RowMenu;
