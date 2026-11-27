"use client";

import { Input } from "@/components/ui/Input";
import type { OutlineSection } from "@/lib/resume/purposes";
import { cn } from "@/lib/utils";
import { arrayMove } from "@dnd-kit/helpers";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { DropdownMenuItem } from "@/components/ui/DropdownMenu";
import { GripVerticalIcon, LayoutListIcon, PencilIcon, UserIcon } from "lucide-react";
import { ComponentProps, memo, ReactNode, useMemo, useState } from "react";
import { overRow } from "../ChecklistSection";
import { WITH_CONTROLS } from "../ChecklistRow";
import RowMenu from "../RowMenu";

/** What the library shows: the profile (null) or a section, scrolled to one of its entries. */
export type LibrarySelection = { sectionId: number | null; entryId?: string };

type DragEndEvent = Parameters<NonNullable<ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0];
type DragData = { sectionId: number; entryId?: string };

/** The button of the outline's row for a selection. */
const outlineRowButton = (rowId: string) =>
  document.querySelector<HTMLElement>(`[data-outline-row="${CSS.escape(rowId)}"] button[data-select]`);

export const outlineRow = ({ sectionId, entryId }: LibrarySelection) =>
  outlineRowButton(sectionId === null ? "profile" : entryId === undefined ? String(sectionId) : `${sectionId}/${entryId}`);

const moved = <T,>(list: T[], index: number, by: -1 | 1) => arrayMove(list, index, index + by);

interface RowProps {
  kind: "profile" | "section" | "entry";
  label: string;
  count?: number;
  selected: boolean;
  onSelect: () => void;
  rowId: string;
  rowRef?: (element: Element | null) => void;
  handleRef?: (element: Element | null) => void;
  /** Shows the handle. */
  draggable?: boolean;
  /** Given with `onRename`: the name as it is, without a stand-in like "Untitled". */
  name?: string;
  /** Renames it here; a double click or the menu starts it. */
  onRename?: (name: string) => void;
  /** Gets what starts renaming, for its menu. */
  menu?: (startRenaming: (() => void) | undefined) => ReactNode;
}

const KIND_STYLES = {
  profile: "font-medium",
  section: "mt-2 font-semibold",
  entry: "pl-5",
};

const ICONS = { profile: UserIcon, section: LayoutListIcon, entry: null };

const Row = ({ kind, label, count, selected, onSelect, rowId, rowRef, handleRef, draggable = false, name, onRename, menu }: RowProps) => {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const startRenaming = onRename
    ? () => {
        setDraft(name ?? "");
        setRenaming(true);
      }
    : undefined;
  const finish = (save: boolean) => {
    if (save && onRename && draft.trim() !== (name ?? "").trim()) onRename(draft.trim());
    setRenaming(false);
    // Back to the row, as the field it had is gone.
    requestAnimationFrame(() => outlineRowButton(rowId)?.focus());
  };
  const Icon = ICONS[kind];

  return (
  <div
    ref={rowRef}
    data-outline-row={rowId}
    className={cn(
      "group/row relative flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-muted/60",
      selected && "bg-muted",
      KIND_STYLES[kind]
    )}
  >
    {handleRef && (
      <button
        ref={handleRef}
        hidden={!draggable}
        type="button"
        tabIndex={-1}
        aria-label={`Drag ${label} to reorder`}
        className={cn(
          "absolute top-1.5 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 active:cursor-grabbing [@media(hover:none)]:opacity-60",
          kind === "section" ? "-left-4" : "left-0.5"
        )}
      >
        <GripVerticalIcon className="size-4" />
      </button>
    )}
    {renaming ? (
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          // Not when Escape took it away.
          onBlur={(event) => event.currentTarget.isConnected && renaming && finish(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") finish(true);
            if (event.key === "Escape") {
              // Not the page's or a dialog's Escape.
              event.stopPropagation();
              finish(false);
            }
          }}
          placeholder={kind === "section" ? "Section heading" : "Entry title"}
          aria-label={`Rename ${label}`}
          className={cn(
            "min-w-0 flex-1 rounded-sm bg-background px-1 py-0.5 outline-2 outline-foreground",
            kind === "entry" && "text-[13px]"
          )}
        />
      </div>
    ) : (
      <button
        type="button"
        data-select
        aria-current={selected || undefined}
        onClick={onSelect}
        onDoubleClick={startRenaming}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-foreground"
      >
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <span className={cn("min-w-0 flex-1 truncate", kind === "entry" && "text-[13px]")}>{label}</span>
        {count !== undefined && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
            {count}
            <span className="sr-only"> {count === 1 ? "item" : "items"}</span>
          </span>
        )}
      </button>
    )}
    {menu ? (
      <span className={cn("shrink-0", WITH_CONTROLS.show)}>{menu(startRenaming)}</span>
    ) : (
      <span aria-hidden className="w-7 shrink-0" />
    )}
  </div>
  );
};

const renameItem = (startRenaming: (() => void) | undefined) =>
  startRenaming && (
    <DropdownMenuItem onSelect={startRenaming}>
      <PencilIcon />
      Rename
    </DropdownMenuItem>
  );

interface EntryRowProps {
  sectionId: number;
  entry: OutlineSection["entries"][number];
  index: number;
  ids: string[];
  sortable: boolean;
  selected: boolean;
  onSelect: (selection: LibrarySelection) => void;
  onReorderEntries: (sectionId: number, ids: string[]) => void;
  onRenameEntry: (sectionId: number, entryId: string, title: string) => void;
}

/**
 * Rows stay mounted with their menu and drag registration while dragging is off,
 * which only disables them: remounting them all made choosing a purpose slow.
 */
const EntryRow = ({ sectionId, entry, index, ids, sortable, selected, onSelect, onReorderEntries, onRenameEntry }: EntryRowProps) => {
  const canMove = sortable && ids.length > 1;
  // Every listed row is in the group, so its indexes stay complete.
  const { ref, handleRef } = useSortable({
    id: `${sectionId}/${entry.id}`,
    type: `entries-${sectionId}`,
    accept: `entries-${sectionId}`,
    group: `entries-${sectionId}`,
    index,
    collisionDetector: overRow,
    // Not disabled when dragging is off, only without its handle: switching purpose
    // then leaves the drag registration as it was, which is much quicker.
    disabled: ids.length < 2,
    data: { sectionId, entryId: entry.id } satisfies DragData,
  });
  const label = entry.title.trim() || "Untitled";

  return (
    <Row
      kind="entry"
      label={label}
      count={entry.count}
      selected={selected}
      onSelect={() => onSelect({ sectionId, entryId: entry.id })}
      rowId={`${sectionId}/${entry.id}`}
      rowRef={ref}
      handleRef={handleRef}
      draggable={canMove}
      name={entry.name}
      onRename={(title) => onRenameEntry(sectionId, entry.id, title)}
      menu={(startRenaming) => (
        <RowMenu
          lazy
          label={label}
          move={{
            canMoveUp: canMove && index > 0,
            canMoveDown: canMove && index < ids.length - 1,
            onMove: (by) => onReorderEntries(sectionId, moved(ids, index, by)),
          }}
        >
          {renameItem(startRenaming)}
        </RowMenu>
      )}
    />
  );
};

const sameIds = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

// The outline is rebuilt on every edit, so rows are compared by what's in them.
const MemoEntryRow = memo(EntryRow, (before, after) =>
  (Object.keys(after) as (keyof EntryRowProps)[]).every((key) => {
    if (key === "entry") {
      const [a, b] = [before.entry, after.entry];
      return a.id === b.id && a.title === b.title && a.name === b.name && a.count === b.count;
    }
    if (key === "ids") return sameIds(before.ids, after.ids);
    return Object.is(before[key], after[key]);
  })
);

interface SectionRowsProps {
  section: OutlineSection;
  index: number;
  ids: number[];
  sortable: boolean;
  /** The entry selected in it, or "" for the section itself; null when another is. */
  selectedEntry: string | null;
  onSelect: (selection: LibrarySelection) => void;
  onReorderSections: (ids: number[]) => void;
  onReorderEntries: (sectionId: number, ids: string[]) => void;
  onRenameSection: (sectionId: number, name: string) => void;
  onRenameEntry: (sectionId: number, entryId: string, title: string) => void;
}

const SectionRows = ({
  section,
  index,
  ids,
  sortable,
  selectedEntry,
  onSelect,
  onReorderSections,
  onReorderEntries,
  onRenameSection,
  onRenameEntry,
}: SectionRowsProps) => {
  const canMove = sortable && ids.length > 1;
  const { ref, targetRef, handleRef } = useSortable({
    id: section.id,
    type: "section",
    accept: "section",
    group: "sections",
    index,
    collisionDetector: overRow,
    // Not disabled when dragging is off, only without its handle: switching purpose
    // then leaves the drag registration as it was, which is much quicker.
    disabled: ids.length < 2,
    data: { sectionId: section.id } satisfies DragData,
  });
  const label = section.name.trim() || "Untitled section";
  const entryIds = section.entries.map(({ id }) => id);

  return (
    <li ref={ref} className="bg-background">
      <Row
        kind="section"
        label={label}
        count={section.count}
        selected={selectedEntry === ""}
        onSelect={() => onSelect({ sectionId: section.id })}
        rowId={String(section.id)}
        rowRef={targetRef}
        handleRef={handleRef}
        draggable={canMove}
        name={section.name}
        onRename={(name) => onRenameSection(section.id, name)}
        menu={(startRenaming) => (
          <RowMenu
            lazy
            label={label}
            move={{
              canMoveUp: canMove && index > 0,
              canMoveDown: canMove && index < ids.length - 1,
              onMove: (by) => onReorderSections(moved(ids, index, by)),
            }}
          >
            {renameItem(startRenaming)}
          </RowMenu>
        )}
      />
      <ul>
        {section.entries.map((entry, position) => (
          <li key={entry.id}>
            <MemoEntryRow
              sectionId={section.id}
              entry={entry}
              index={position}
              ids={entryIds}
              sortable={sortable}
              selected={selectedEntry === entry.id}
              onSelect={onSelect}
              onReorderEntries={onReorderEntries}
              onRenameEntry={onRenameEntry}
            />
          </li>
        ))}
      </ul>
    </li>
  );
};

const MemoSectionRows = memo(SectionRows, (before, after) =>
  (Object.keys(after) as (keyof SectionRowsProps)[]).every((key) => {
    if (key === "section") return JSON.stringify(before.section) === JSON.stringify(after.section);
    if (key === "ids") return sameIds(before.ids, after.ids);
    return Object.is(before[key], after[key]);
  })
);

interface LibraryOutlineProps {
  /** From outline(). */
  sections: OutlineSection[];
  selected: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
  /** Every section's id, in the new order. */
  onReorderSections: (ids: number[]) => void;
  /** Every entry's id of the section, in the new order. */
  onReorderEntries: (sectionId: number, ids: string[]) => void;
  /** A section's heading, from its row. */
  onRenameSection: (sectionId: number, name: string) => void;
  /** An entry's title, from its row. */
  onRenameEntry: (sectionId: number, entryId: string, title: string) => void;
  query: string;
  onQuery: (query: string) => void;
  /** A purpose is chosen, so not everything is listed. */
  filtered: boolean;
}

/** The profile, then each section and its entries, to choose one and put them in order. */
const LibraryOutline = ({
  sections,
  selected,
  onSelect,
  onReorderSections,
  onReorderEntries,
  onRenameSection,
  onRenameEntry,
  query,
  onQuery,
  filtered,
}: LibraryOutlineProps) => {
  const searching = query.trim() !== "";
  // Only the whole library can be put in order.
  const sortable = !searching && !filtered;
  const ids = useMemo(() => sections.map(({ id }) => id), [sections]);

  const onDragEnd = (event: DragEndEvent) => {
    const { source } = event.operation;
    if (event.canceled || !sortable || !isSortable(source)) return;

    const { sectionId, entryId } = source.data as DragData;
    const { initialIndex: from, index: to } = source;
    if (from === to) return;
    if (entryId === undefined) {
      onReorderSections(arrayMove(ids, from, to));
      return;
    }
    const entries = sections.find((section) => section.id === sectionId)?.entries ?? [];
    onReorderEntries(sectionId, arrayMove(entries.map(({ id }) => id), from, to));
  };

  return (
    <nav aria-label="Library outline" className="border-t border-border px-3 pt-4 pb-6">
      <Input
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search"
        aria-label="Search the library"
        className="mb-3"
      />

      <Row
        kind="profile"
        label="Profile"
        selected={selected.sectionId === null}
        onSelect={() => onSelect({ sectionId: null })}
        rowId="profile"
      />

      {sections.length === 0 && (
        <p className="mt-3 px-2 text-sm text-muted-foreground">
          {searching ? "Nothing matches." : filtered ? "Nothing is in this collection yet." : "No sections yet."}
        </p>
      )}

      <DragDropProvider onDragEnd={onDragEnd}>
        <ul className="pl-4">
          {sections.map((section, index) => (
            <MemoSectionRows
              key={section.id}
              section={section}
              index={index}
              ids={ids}
              sortable={sortable}
              selectedEntry={selected.sectionId === section.id ? (selected.entryId ?? "") : null}
              onSelect={onSelect}
              onReorderSections={onReorderSections}
              onReorderEntries={onReorderEntries}
              onRenameSection={onRenameSection}
              onRenameEntry={onRenameEntry}
            />
          ))}
        </ul>
      </DragDropProvider>
    </nav>
  );
};

export default LibraryOutline;
