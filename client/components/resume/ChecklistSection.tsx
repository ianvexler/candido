"use client";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import type { ChecklistEntry, ChecklistSection as Section } from "@/lib/resume/checklist";
import { ChecklistActions, ChecklistTarget, targetKey } from "@/lib/resume/useCvChecklist";
import { useSortable } from "@dnd-kit/react/sortable";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PanelLeftIcon, Trash2Icon } from "lucide-react";
import { memo, ReactNode, useCallback } from "react";
import ChecklistRow, { ChecklistItemRow } from "./ChecklistRow";
import { REMOVE_SECTION } from "./removeSection";

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

interface RowMenuProps {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (by: -1 | 1) => void;
  children?: ReactNode;
}

const RowMenu = ({ label, canMoveUp, canMoveDown, onMove, children }: RowMenuProps) => (
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
      <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
        <ArrowUpIcon />
        Move up
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
        <ArrowDownIcon />
        Move down
      </DropdownMenuItem>
      {children}
    </DropdownMenuContent>
  </DropdownMenu>
);

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
  actions: ChecklistActions;
}

const EntryRows = ({ section, entry, index, count, bare, pending, canReorder, actions }: EntryRowsProps) => {
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
          menu={
            sortable ? (
              <RowMenu
                label={entry.title}
                canMoveUp={index > 0}
                canMoveDown={index < count - 1}
                onMove={(by) => actions.moveEntry(sectionId, entry.id, by)}
              />
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
  /** The keys of this section's targets that are being included. */
  pending: string[];
  /** Null when the template has one column. */
  column: "sidebar" | "main" | null;
  /** False while searching. */
  canReorder: boolean;
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
        menu={
          inCv ? (
            <RowMenu
              label={label}
              canMoveUp={canReorder && index > 0}
              canMoveDown={canReorder && index < count - 1}
              onMove={(by) => actions.moveSection(sectionId, by)}
            >
              <DropdownMenuSeparator />
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
