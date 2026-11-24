"use client";

import type { TransferDirection } from "@/api/resources/curriculums/transferWithLibrary";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import { ChecklistEntry, ChecklistSection as Section, entryOffer, itemOffer } from "@/lib/resume/checklist";
import type { TransferTarget } from "@/lib/resume/transfer";
import { ChecklistActions, ChecklistTarget, targetKey, transferKey } from "@/lib/resume/useCvChecklist";
import { useSortable } from "@dnd-kit/react/sortable";
import { PanelLeftIcon, Trash2Icon } from "lucide-react";
import { memo, useCallback } from "react";
import ChecklistRow, { ChecklistItemRow, rowBox } from "./ChecklistRow";
import { changeControls } from "./ItemChangeMenu";
import { REMOVE_SECTION } from "./removeSection";
import RowMenu from "./RowMenu";

/** What dragging a row gives the drop handler. */
export type DragData = { sectionId: number; entryId?: string };

type Detector = NonNullable<Parameters<typeof useSortable>[0]["collisionDetector"]>;

/**
 * Where the pointer is, by the row of a block alone. By its whole height a tall
 * block would still be under the pointer after making way, and swap back.
 */
const overRow: Detector = ({ dragOperation, droppable }) => {
  const { y } = dragOperation.position.current;
  const row = droppable.shape?.boundingRectangle;
  if (!row || y < row.top || y > row.bottom || droppable.id === dragOperation.source?.id) return null;
  // As for being under the pointer: dnd-kit doesn't export its names for these.
  return { id: droppable.id, value: 1, type: 2, priority: 3 };
};

const sortableId = (sectionId: number | null, key: string, entryId?: string) =>
  entryId === undefined ? (sectionId ?? key) : `${key}/${entryId}`;

const rowIdOf = ({ sectionId, entryId, itemId = "" }: TransferTarget) => [sectionId, entryId, itemId].join("/");

/** Focus stays on the row when the button that was used is gone. */
const transferFrom = async (actions: ChecklistActions, rowId: string, target: TransferTarget, direction: TransferDirection) => {
  await actions.transfer(target, direction);
  requestAnimationFrame(() => {
    if (document.activeElement === document.body) rowBox(rowId)?.focus();
  });
};

/** What an entry's row offers, or its section's if that stands for it. */
const entryControls = (
  { entry, sectionId, offerChanges, pending, actions }: Pick<EntryRowsProps, "entry" | "offerChanges" | "pending" | "actions"> & { sectionId: number | null },
  label: string,
  rowId: string
): ReturnType<typeof changeControls> => {
  if (sectionId === null || !offerChanges) return {};
  const target = { sectionId, entryId: entry.id };
  return changeControls(entryOffer(entry), {
    label,
    changed: entry.differences,
    busy: pending.includes(transferKey(target)),
    onChoose: (direction) => void transferFrom(actions, rowId, target, direction),
  });
};

interface EntryRowsProps {
  section: Section;
  entry: ChecklistEntry;
  /** Among the CV's entries of the section, and how many there are. */
  index: number;
  count: number;
  /** Its only entry, and without a title: items go right under the section. */
  bare: boolean;
  pending: string[];
  canReorder: boolean;
  /** The library is known. */
  offerChanges: boolean;
  actions: ChecklistActions;
}

const EntryRows = ({ section, entry, index, count, bare, pending, canReorder, offerChanges, actions }: EntryRowsProps) => {
  const { sectionId, templateId } = section;
  const sortable = entry.inCv && sectionId !== null && canReorder && count > 1;
  const { ref, targetRef, handleRef } = useSortable({
    id: sortableId(sectionId, section.key, entry.id),
    type: `entries-${section.key}`,
    accept: `entries-${section.key}`,
    // dnd-kit needs each group's indexes to be complete, so what can't move is on its own.
    group: sortable ? section.key : `${section.key}/${entry.id}`,
    index: sortable ? index : 0,
    collisionDetector: overRow,
    disabled: !sortable,
    data: { sectionId, entryId: entry.id },
  });

  const target: ChecklistTarget = { sectionId, templateId, entryId: entry.id, inCv: entry.inCv };
  // Kept the same, so ticking one item doesn't render the others.
  const tickItem = useCallback(
    (itemId: string, inCv: boolean, on: boolean) =>
      actions.tick({ sectionId, templateId, entryId: entry.id, itemId, inCv }, on),
    [actions, sectionId, templateId, entry.id]
  );
  const transferItem = useCallback(
    (itemId: string, direction: TransferDirection) => {
      if (sectionId === null) return;
      const item = { sectionId, entryId: entry.id, itemId };
      void transferFrom(actions, rowIdOf(item), item, direction);
    },
    [actions, sectionId, entry.id]
  );

  const rowId = sectionId === null ? undefined : rowIdOf({ sectionId, entryId: entry.id });
  const { add, change } = entryControls({ entry, sectionId, offerChanges, pending, actions }, entry.title, rowId ?? "");

  return (
    // Without a handle the whole block would be announced as the thing to drag.
    <div ref={sortable ? ref : undefined} className="bg-background">
      {!bare && (
        <ChecklistRow
          kind="entry"
          label={entry.title}
          state={entry.state}
          included={entry.included}
          total={entry.items.length > 0 ? entry.total : 0}
          isNew={entry.isNew && !section.isNew}
          busy={pending.includes(targetKey(target))}
          onTick={(on) => actions.tick(target, on)}
          rowRef={sortable ? targetRef : undefined}
          handleRef={sortable ? handleRef : undefined}
          rowId={rowId}
          change={change}
          menu={
            sortable || add ? (
              <RowMenu
                label={entry.title}
                move={
                  sortable
                    ? {
                        canMoveUp: index > 0,
                        canMoveDown: index < count - 1,
                        onMove: (by) => actions.moveEntry(sectionId, entry.id, by),
                      }
                    : undefined
                }
              >
                {sortable && add && <DropdownMenuSeparator />}
                {add}
              </RowMenu>
            ) : undefined
          }
        />
      )}
      {entry.items.map((item, position) => (
        <ChecklistItemRow
          key={item.id || `no-id-${position}`}
          itemId={item.id}
          inCv={item.inCv}
          label={item.text}
          ticked={item.ticked}
          isNew={item.isNew && !entry.isNew && !section.isNew}
          busy={pending.includes(targetKey({ ...target, itemId: item.id }))}
          onTickItem={tickItem}
          rowId={sectionId === null || item.id === "" ? undefined : rowIdOf({ sectionId, entryId: entry.id, itemId: item.id })}
          offer={offerChanges ? itemOffer(entry, item) : null}
          libraryText={item.libraryText}
          transferring={sectionId !== null && pending.includes(transferKey({ sectionId, entryId: entry.id, itemId: item.id }))}
          onTransferItem={transferItem}
        />
      ))}
    </div>
  );
};

interface ChecklistSectionProps {
  section: Section;
  index: number;
  /** Sections in the CV. */
  count: number;
  /** The keys of this section's targets that are being included or passed on. */
  pending: string[];
  /** Null when the template has one column. */
  column: "sidebar" | "main" | null;
  /** False while searching. */
  canReorder: boolean;
  /** The library is known. */
  offerChanges: boolean;
  actions: ChecklistActions;
  onAskRemove: (id: number) => void;
}

/** A section's row and those of its entries and items. */
const ChecklistSection = ({
  section,
  index,
  count,
  pending,
  column,
  canReorder,
  offerChanges,
  actions,
  onAskRemove,
}: ChecklistSectionProps) => {
  const { sectionId, templateId, entries } = section;
  const inCv = sectionId !== null;
  const sortable = inCv && canReorder && count > 1;
  const { ref, targetRef, handleRef } = useSortable({
    id: sortableId(sectionId, section.key),
    type: "section",
    accept: "section",
    group: sortable ? "sections" : `fixed-${section.key}`,
    index: sortable ? index : 0,
    collisionDetector: overRow,
    disabled: !sortable,
    data: { sectionId },
  });

  const label = section.name.trim() || "Section";
  const target: ChecklistTarget = { sectionId, templateId, inCv };
  const ours = entries.filter((entry) => entry.inCv);
  const [only] = entries;
  const bare =
    entries.length === 1 &&
    (only.items.length === 0 ? only.title === "Untitled" : only.items.some(({ text }) => text === only.title));
  const rowId = `section-${sectionId}`;
  const { add, change }: ReturnType<typeof entryControls> = bare
    ? entryControls({ entry: only, sectionId, offerChanges, pending, actions }, label, rowId)
    : {};

  return (
    <div ref={sortable ? ref : undefined} className="bg-background">
      <ChecklistRow
        kind="section"
        label={label}
        state={section.state}
        included={section.included}
        total={section.total}
        isNew={section.isNew}
        busy={pending.includes(targetKey(target))}
        onTick={(on) => actions.tick(target, on)}
        rowRef={sortable ? targetRef : undefined}
        handleRef={sortable ? handleRef : undefined}
        rowId={rowId}
        change={change}
        menu={
          inCv ? (
            <RowMenu
              label={label}
              move={{
                canMoveUp: canReorder && index > 0,
                canMoveDown: canReorder && index < count - 1,
                onMove: (by) => actions.moveSection(sectionId, by),
              }}
            >
              <DropdownMenuSeparator />
              {add}
              {column && (
                <DropdownMenuItem onSelect={() => actions.toggleColumn(sectionId)}>
                  <PanelLeftIcon />
                  {column === "sidebar" ? "Move to main" : "Move to sidebar"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onAskRemove(sectionId)}>
                <Trash2Icon />
                {REMOVE_SECTION.label}
              </DropdownMenuItem>
            </RowMenu>
          ) : undefined
        }
      />
      {entries.map((entry) => (
        <EntryRows
          key={entry.id}
          section={section}
          entry={entry}
          index={ours.indexOf(entry)}
          count={ours.length}
          bare={bare}
          pending={pending}
          canReorder={canReorder}
          offerChanges={offerChanges}
          actions={actions}
        />
      ))}
    </div>
  );
};

// The checklist is rebuilt on every edit, so rows are compared by what's in them.
export default memo(ChecklistSection, (before, after) =>
  (Object.keys(after) as (keyof ChecklistSectionProps)[]).every(
    (key) =>
      Object.is(before[key], after[key]) ||
      ((key === "section" || key === "pending") && JSON.stringify(before[key]) === JSON.stringify(after[key]))
  )
);
