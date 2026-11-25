"use client";

import type { TransferDirection } from "@/api/resources/curriculums/transferWithLibrary";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/DropdownMenu";
import { ChecklistEntry, ChecklistSection as Section, entryOffer, itemOffer } from "@/lib/resume/checklist";
import type { TransferTarget } from "@/lib/resume/transfer";
import { ChecklistActions, ChecklistTarget, targetKey, transferKey } from "@/lib/resume/useCvChecklist";
import { useSortable } from "@dnd-kit/react/sortable";
import { CalendarPlusIcon, HeadingIcon, ListPlusIcon, PanelLeftIcon, PencilIcon, PlusIcon, TextIcon, Trash2Icon } from "lucide-react";
import { memo, useCallback } from "react";
import ChecklistRow, { ChecklistItemRow, rowBox, rowIdOf, textStart } from "./ChecklistRow";
import { changeControls } from "./ItemChangeMenu";
import { REMOVE_SECTION } from "./removeSection";
import { entryEdit, itemEdit } from "./rowEdits";
import RowMenu, { RowMenuAction } from "./RowMenu";
import type { CvEdits } from "./useCvEdits";

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
  sectionId: number | null;
  templateId: number | null;
  sectionKey: string;
  sectionIsNew: boolean;
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
  edits: CvEdits;
}

/** The checklist is rebuilt on every edit, so rows are compared by what's in them. */
const sameRows = <P extends object>(before: P, after: P) =>
  (Object.keys(after) as (keyof P)[]).every(
    (key) =>
      Object.is(before[key], after[key]) ||
      (["section", "entry", "pending"].includes(String(key)) && JSON.stringify(before[key]) === JSON.stringify(after[key]))
  );

const EntryRows = memo(({
  sectionId,
  templateId,
  sectionKey,
  sectionIsNew,
  entry,
  index,
  count,
  bare,
  pending,
  canReorder,
  offerChanges,
  actions,
  edits,
}: EntryRowsProps) => {
  const sortable = entry.inCv && sectionId !== null && canReorder && count > 1;
  const { ref, targetRef, handleRef } = useSortable({
    id: sortableId(sectionId, sectionKey, entry.id),
    type: `entries-${sectionKey}`,
    accept: `entries-${sectionKey}`,
    // dnd-kit needs each group's indexes to be complete, so what can't move is on its own.
    group: sortable ? sectionKey : `${sectionKey}/${entry.id}`,
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

  const editItem = useCallback(
    (itemId: string) => {
      const target = itemEdit(sectionId, entry.id, { id: itemId, inCv: true });
      if (target) edits.edit(target);
    },
    [edits, sectionId, entry.id]
  );

  const edit = entryEdit(sectionId, entry);
  const editTip = entry.has.title ? "Edit title" : "Edit";
  const goEdit = () => edit && edits.edit(edit);
  const addBullet = () => sectionId !== null && edits.addBullet(sectionId, entry.id);
  const missing = (what: "title" | "summary" | "details", label: string, icon: RowMenuAction["icon"]): RowMenuAction[] =>
    sectionId === null || entry.has[what]
      ? []
      : [{ label, icon, onSelect: () => edits.edit({ sectionId, entryId: entry.id, what }) }];

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
          isNew={entry.isNew && !sectionIsNew}
          busy={pending.includes(targetKey(target))}
          onTick={(on) => actions.tick(target, on)}
          rowRef={sortable ? targetRef : undefined}
          handleRef={sortable ? handleRef : undefined}
          rowId={rowId}
          change={change}
          edit={edit ? { tip: editTip, label: `Edit: ${textStart(entry.title)}`, onClick: goEdit } : undefined}
          add={edit ? { tip: "Add bullet", label: `Add a bullet to ${textStart(entry.title)}`, onClick: addBullet } : undefined}
          menu={
            edit ? (
              <RowMenu
                label={entry.title}
                actions={[
                  { label: editTip, icon: <PencilIcon />, onSelect: goEdit },
                  { label: "Add bullet", icon: <ListPlusIcon />, onSelect: addBullet },
                  ...missing("title", "Add title", <HeadingIcon />),
                  ...missing("summary", "Add summary", <TextIcon />),
                  ...missing("details", "Add role and dates", <CalendarPlusIcon />),
                ]}
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
          isNew={item.isNew && !entry.isNew && !sectionIsNew}
          busy={pending.includes(targetKey({ ...target, itemId: item.id }))}
          onTickItem={tickItem}
          rowId={sectionId === null || item.id === "" ? undefined : rowIdOf({ sectionId, entryId: entry.id, itemId: item.id })}
          offer={offerChanges ? itemOffer(entry, item) : null}
          libraryText={item.libraryText}
          shownText={item.shownText}
          transferring={sectionId !== null && pending.includes(transferKey({ sectionId, entryId: entry.id, itemId: item.id }))}
          onTransferItem={transferItem}
          onEditItem={itemEdit(sectionId, entry.id, item) ? editItem : null}
        />
      ))}
    </div>
  );
}, sameRows);
EntryRows.displayName = "EntryRows";

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
  /** See isBare; of all its entries, not only those that were found. */
  bare: boolean;
  actions: ChecklistActions;
  edits: CvEdits;
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
  bare,
  actions,
  edits,
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
  const rowId = `section-${sectionId}`;
  const { add, change }: ReturnType<typeof entryControls> = bare
    ? entryControls({ entry: only, sectionId, offerChanges, pending, actions }, label, rowId)
    : {};

  const editHeading = () => inCv && edits.edit({ sectionId, what: "heading" });
  const addEntry = () => inCv && edits.addEntry(sectionId);
  const addBullet = () => inCv && edits.addBullet(sectionId, only.id);

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
        edit={inCv ? { tip: "Edit heading", label: `Edit: ${textStart(label)}`, onClick: editHeading } : undefined}
        add={
          inCv
            ? { tip: bare ? "Add bullet" : "Add entry", label: `Add to ${textStart(label)}`, onClick: bare ? addBullet : addEntry }
            : undefined
        }
        menu={
          inCv ? (
            <RowMenu
              label={label}
              actions={[
                { label: "Edit heading", icon: <PencilIcon />, onSelect: editHeading },
                ...(bare ? [{ label: "Add bullet", icon: <ListPlusIcon />, onSelect: addBullet }] : []),
                { label: "Add entry", icon: <PlusIcon />, onSelect: addEntry },
              ]}
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
          sectionId={sectionId}
          templateId={templateId}
          sectionKey={section.key}
          sectionIsNew={section.isNew}
          entry={entry}
          index={ours.indexOf(entry)}
          count={ours.length}
          bare={bare}
          pending={pending}
          canReorder={canReorder}
          offerChanges={offerChanges}
          actions={actions}
          edits={edits}
        />
      ))}
    </div>
  );
};

export default memo(ChecklistSection, sameRows);
