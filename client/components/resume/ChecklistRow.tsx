"use client";

import type { TransferDirection } from "@/api/resources/curriculums/transferWithLibrary";
import type { TickState } from "@/lib/resume/checklist";
import type { ItemState } from "@/lib/resume/itemState";
import { cn } from "@/lib/utils";
import { GripVerticalIcon } from "lucide-react";
import { memo, ReactNode, useLayoutEffect, useRef } from "react";
import { changeControls } from "./ItemChangeMenu";
import RowMenu from "./RowMenu";

interface ChecklistRowProps {
  kind: "section" | "entry" | "item";
  label: string;
  state: TickState;
  /** "2 of 5", for what has items. */
  included?: number;
  total?: number;
  isNew?: boolean;
  /** Being copied in from the library. */
  busy?: boolean;
  /** It can't be ticked. */
  disabled?: boolean;
  onTick: (on: boolean) => void;
  /** Given when the row can be dragged. */
  handleRef?: (element: Element | null) => void;
  rowRef?: (element: Element | null) => void;
  /** Names the row for rowBox. */
  rowId?: string;
  /** The Changed button. */
  change?: ReactNode;
  menu?: ReactNode;
}

/** The tick box of the row with this id. */
export const rowBox = (rowId: string) =>
  document.querySelector<HTMLInputElement>(`[data-row="${CSS.escape(rowId)}"] input[type="checkbox"]`);

const KIND_STYLES = {
  section: "mt-3 font-semibold",
  entry: "pl-4 font-medium",
  item: "pl-10 text-[13px]",
};

/** A tick box and its label. Untick what is partly ticked to leave it out. */
const ChecklistRow = ({
  kind,
  label,
  state,
  included = 0,
  total = 0,
  isNew = false,
  busy = false,
  disabled = false,
  onTick,
  handleRef,
  rowRef,
  rowId,
  change,
  menu,
}: ChecklistRowProps) => {
  const boxRef = useRef<HTMLInputElement>(null);
  const partial = state === "partial";
  // Browsers clear it on every click.
  useLayoutEffect(() => {
    if (boxRef.current) boxRef.current.indeterminate = partial;
  });

  return (
    <div
      ref={rowRef}
      data-row={rowId}
      className={cn(
        "group/row relative flex items-start gap-1 rounded-md pr-1.5 text-sm hover:bg-muted/60",
        KIND_STYLES[kind]
      )}
    >
      {handleRef && (
        <button
          ref={handleRef}
          type="button"
          tabIndex={-1}
          aria-label={`Drag ${label} to reorder`}
          className={cn(
            "absolute top-1 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-60",
            kind === "section" ? "-left-4" : "-left-1.5"
          )}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      <label
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 py-1 pl-1.5",
          (busy || disabled) && "cursor-default",
          busy && "opacity-60"
        )}
      >
        <input
          ref={boxRef}
          type="checkbox"
          checked={state === "on"}
          disabled={disabled}
          // Not disabled while busy, which would lose the focus.
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          onChange={(event) => {
            event.currentTarget.indeterminate = partial;
            if (!busy) onTick(state === "off");
          }}
          className="mt-[3px] size-[15px] shrink-0 cursor-[inherit] rounded-sm accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        />
        <span className={cn("line-clamp-2 min-w-0 flex-1 break-words", state === "off" && "text-muted-foreground")}>
          {label}
        </span>
        {isNew && (
          <span className="shrink-0 rounded-full bg-candido/20 px-2 text-xs leading-5 font-normal">New</span>
        )}
        {total > 0 && (
          <span className="shrink-0 text-xs leading-5 font-normal whitespace-nowrap text-muted-foreground">
            {included} of {total}
          </span>
        )}
      </label>
      {change}
      {menu ?? (kind !== "item" && <span aria-hidden className="w-6 shrink-0" />)}
    </div>
  );
};

/** One item of an entry. Simple props, so only what changed renders again. */
export const ChecklistItemRow = memo(
  ({
    itemId,
    inCv,
    onTickItem,
    ticked,
    offer,
    libraryText,
    transferring,
    onTransferItem,
    ...row
  }: Pick<ChecklistRowProps, "label" | "isNew" | "busy" | "rowId"> & {
    itemId: string;
    inCv: boolean;
    ticked: boolean;
    onTickItem: (itemId: string, inCv: boolean, on: boolean) => void;
    /** See itemOffer. */
    offer: ItemState | null;
    libraryText: string | null;
    transferring: boolean;
    onTransferItem: (itemId: string, direction: TransferDirection) => void;
  }) => {
    const { add, change } = changeControls(offer, {
      label: row.label,
      changed: { cv: row.label, library: libraryText ?? "" },
      busy: transferring,
      onChoose: (direction) => onTransferItem(itemId, direction),
    });
    return (
      <ChecklistRow
        {...row}
        kind="item"
        state={ticked ? "on" : "off"}
        // Not stored with an id yet.
        disabled={itemId === ""}
        onTick={(on) => onTickItem(itemId, inCv, on)}
        change={change}
        menu={add && <RowMenu label={row.label}>{add}</RowMenu>}
      />
    );
  }
);
ChecklistItemRow.displayName = "ChecklistItemRow";

export default ChecklistRow;
