"use client";

import type { TransferDirection } from "@/api/resources/curriculums/transferWithLibrary";
import type { TickState } from "@/lib/resume/checklist";
import type { ItemState } from "@/lib/resume/itemState";
import type { TransferTarget } from "@/lib/resume/transfer";
import { cn } from "@/lib/utils";
import { GripVerticalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { memo, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { changeControls } from "./ItemChangeMenu";
import IconAction from "./IconAction";
import RowMenu from "./RowMenu";

/** A button on a row: its tooltip, and its name with what it is for. */
type RowAction = { tip: string; label: string; onClick: () => void };

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
  edit?: RowAction;
  add?: RowAction;
  menu?: ReactNode;
}

export const rowIdOf = ({ sectionId, entryId, itemId = "" }: TransferTarget) => [sectionId, entryId, itemId].join("/");

/** The tick box of the row with this id. */
export const rowBox = (rowId: string) =>
  document.querySelector<HTMLInputElement>(`[data-row="${CSS.escape(rowId)}"] input[type="checkbox"]`);

const KIND_STYLES = {
  section: "mt-3 font-semibold",
  entry: "pl-4 font-medium",
  item: "pl-10 text-[13px]",
};

const CONTROL = "size-[28px] [@media(hover:none)]:size-[40px]";

// Room for the row's controls, whether they show or not, beside a button they would
// cover. Otherwise only its count has room, and they cover the end of the label.
const CONTROLS_WIDTH = {
  one: "min-w-[28px]",
  two: "min-w-[56px]",
  three: "min-w-[84px]",
};

const OVER_LABEL =
  "absolute top-0 right-0 rounded-md bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_60%,var(--background))] [@media(hover:none)]:static [@media(hover:none)]:bg-transparent";

// For the pointer, or the keyboard, or with the row's menu open; always for touch.
export const WITH_CONTROLS = {
  show: "pointer-events-none opacity-0 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-has-focus-visible/row:pointer-events-auto group-has-focus-visible/row:opacity-100 group-has-[[aria-haspopup=menu][data-state=open]]/row:pointer-events-auto group-has-[[aria-haspopup=menu][data-state=open]]/row:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
  hide: "group-hover/row:opacity-0 group-has-focus-visible/row:opacity-0 group-has-[[aria-haspopup=menu][data-state=open]]/row:opacity-0 [@media(hover:none)]:hidden",
};

/** Its props stay the same as its row renders again, as it does while its text is typed. */
const RowButton = memo(({ tip, label, icon, onClick }: RowAction & { icon: "edit" | "add" }) => (
  <IconAction label={tip} aria-label={label} onClick={onClick} className={CONTROL}>
    {icon === "edit" ? <PencilIcon className="size-3.5" /> : <PlusIcon />}
  </IconAction>
));
RowButton.displayName = "RowButton";

/** A press's handler that stays the same. */
const useSameHandler = (handler: (() => void) | undefined) => {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  return useCallback(() => latest.current?.(), []);
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
  edit,
  add,
  menu,
}: ChecklistRowProps) => {
  const boxRef = useRef<HTMLInputElement>(null);
  const onEdit = useSameHandler(edit?.onClick);
  const onAdd = useSameHandler(add?.onClick);
  const countId = useId();
  const hasControls = Boolean(edit || add || menu);
  const width = kind === "item" ? (edit && menu ? "two" : "one") : "three";
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
          "flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 py-1 pl-1.5 [@media(hover:none)]:py-2.5",
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
          aria-describedby={total > 0 ? countId : undefined}
          onChange={(event) => {
            event.currentTarget.indeterminate = partial;
            if (!busy) onTick(state === "off");
          }}
          className="mt-[3px] size-[15px] shrink-0 cursor-[inherit] rounded-sm accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        />
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 break-words", state === "off" && "text-muted-foreground")}>{label}</span>
          {total > 0 && hasControls && (
            <span aria-hidden className="hidden text-xs leading-5 font-normal text-muted-foreground [@media(hover:none)]:block">
              {included} of {total}
            </span>
          )}
        </span>
        {isNew && (
          <span className="shrink-0 rounded-full bg-candido/20 px-2 text-xs leading-5 font-normal">New</span>
        )}
      </label>
      {change}
      <div className={cn("relative min-h-[28px] shrink-0", change && hasControls && CONTROLS_WIDTH[width])}>
        {total > 0 && (
          <span
            id={countId}
            className={cn(
              "block py-1 pr-1 text-right text-xs leading-5 font-normal whitespace-nowrap text-muted-foreground",
              hasControls && WITH_CONTROLS.hide
            )}
          >
            {included} of {total}
          </span>
        )}
        {hasControls && (
          <div className={cn("flex justify-end", OVER_LABEL, WITH_CONTROLS.show)}>
            {edit && <RowButton tip={edit.tip} label={edit.label} icon="edit" onClick={onEdit} />}
            {add && <RowButton tip={add.tip} label={add.label} icon="add" onClick={onAdd} />}
            {menu}
          </div>
        )}
      </div>
    </div>
  );
};

const NAME_LENGTH = 60;

/** Enough of a text to name it by. */
export const textStart = (text: string) => (text.length > NAME_LENGTH ? `${text.slice(0, NAME_LENGTH).trimEnd()}…` : text);

/** One item of an entry. Simple props, so only what changed renders again. */
export const ChecklistItemRow = memo(
  ({
    itemId,
    inCv,
    onTickItem,
    ticked,
    offer,
    libraryText,
    shownText,
    transferring,
    onTransferItem,
    onEditItem,
    ...row
  }: Pick<ChecklistRowProps, "label" | "isNew" | "busy" | "rowId"> & {
    itemId: string;
    inCv: boolean;
    ticked: boolean;
    onTickItem: (itemId: string, inCv: boolean, on: boolean) => void;
    /** See itemOffer. */
    offer: ItemState | null;
    libraryText: string | null;
    shownText: string | null;
    transferring: boolean;
    onTransferItem: (itemId: string, direction: TransferDirection) => void;
    /** Without it, it can't be edited. */
    onEditItem: ((itemId: string) => void) | null;
  }) => {
    const { add, change } = changeControls(offer, {
      label: row.label,
      changed: { cv: row.label, library: libraryText ?? "", shown: shownText },
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
        edit={onEditItem ? { tip: "Edit", label: `Edit: ${textStart(row.label)}`, onClick: () => onEditItem(itemId) } : undefined}
        menu={add && <RowMenu label={row.label}>{add}</RowMenu>}
      />
    );
  }
);
ChecklistItemRow.displayName = "ChecklistItemRow";

export default ChecklistRow;
