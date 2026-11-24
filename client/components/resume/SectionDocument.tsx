"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { emptyEntry, moveEntry } from "@/lib/resume/sectionEntries";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import { CvSuggestion, SectionEntry, SectionFields } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { ReactNode, Ref, useEffect, useMemo, useRef, useState } from "react";
import IconAction from "./IconAction";
import SectionEntryEditor, { EntryChange, SuggestionProps } from "./SectionEntryEditor";
import { ghostInput } from "./styles";

const NO_VERSIONS: EntryVersions = {};
const NO_SUGGESTIONS: CvSuggestion[] = [];

interface SectionDocumentProps extends SuggestionProps {
  /** With at least one entry. */
  section: SectionFields & { id: number };
  /** From useSectionDrafts; an entry's editor is remounted when its version changes. */
  versions?: EntryVersions;
  onChange: (change: SectionChange, editor?: EntryEditor) => void;
  /** Deletes the record. Rejecting keeps the section on screen. */
  onDelete: () => Promise<void>;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription: string;
  /** Extra icon actions at the top right, shown on hover before the built-in ones. */
  actions?: ReactNode;
  /** Shown in the left margin on hover, e.g. a drag handle. */
  handle?: ReactNode;
  /** Shown above the section, e.g. a "library changed" notice. */
  notice?: ReactNode;
  /** Fades the page, e.g. when the section is hidden from a CV. */
  dimmed?: boolean;
  /** Offers leaving single entries out, as a resume does. */
  canHideEntries?: boolean;
  articleRef?: Ref<HTMLElement>;
  className?: string;
}

/**
 * A paper-style editor for one section and its entries. Controls stay out of the way until the
 * section is hovered, focused or text is selected. Saving is up to `onChange`.
 */
const SectionDocument = ({
  section,
  versions = NO_VERSIONS,
  onChange,
  onDelete,
  deleteLabel,
  deleteTitle,
  deleteDescription,
  actions,
  handle,
  notice,
  dimmed = false,
  canHideEntries = false,
  articleRef,
  className,
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
  onStaleChange,
}: SectionDocumentProps) => {
  const { section_type: sectionType, entries } = section;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editors = useRef(new Map<string, Editor>());

  const changeEntries = (change: (entries: SectionEntry[]) => SectionEntry[], editor?: EntryEditor) =>
    onChange((current) => ({ entries: change(current.entries) }), editor);
  const changeEntry = (id: string, changes: EntryChange) =>
    changeEntries(
      (list) =>
        list.map((entry) =>
          entry.id === id ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
        ),
      { entryId: id, version: versions[id] ?? 0 }
    );

  // --- Review suggestions -------------------------------------------------
  // Reviews from before sections had entries are about the first one.
  const firstEntryId = entries[0].id;
  const suggestionsByEntry = useMemo(() => {
    const map = new Map<string, CvSuggestion[]>();
    suggestions.forEach((s) => {
      const entryId = s.entry_id ?? firstEntryId;
      map.set(entryId, [...(map.get(entryId) ?? []), s]);
    });
    return map;
  }, [suggestions, firstEntryId]);

  // Stale suggestion ids as each entry last reported them. Pending ones about
  // a deleted entry are stale too.
  const [staleByEntry, setStaleByEntry] = useState<Record<string, number[]>>({});
  const entryIds = entries.map((entry) => entry.id);
  const staleKey = [
    ...entryIds.flatMap((id) => staleByEntry[id] ?? []),
    ...suggestions
      .filter((s) => s.status === "pending" && s.entry_id !== null && !entryIds.includes(s.entry_id))
      .map((s) => s.id),
  ].join(",");
  const reportedStale = useRef("");
  useEffect(() => {
    if (!onStaleChange || staleKey === reportedStale.current) return;
    reportedStale.current = staleKey;
    onStaleChange(staleKey ? staleKey.split(",").map(Number) : []);
  }, [onStaleChange, staleKey]);

  return (
    <>
      <article
        ref={articleRef}
        data-section-id={section.id}
        className={cn(
          "group/section relative mx-auto w-full max-w-2xl bg-white px-10 pb-6 pt-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14 transition-opacity",
          dimmed && "opacity-55",
          className
        )}
      >
        {handle && (
          <div className="absolute left-2 top-9 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100 sm:left-4">
            {handle}
          </div>
        )}

        <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
          {actions}
          <IconAction label={deleteLabel} onClick={() => setDeleteOpen(true)}>
            <Trash2Icon />
          </IconAction>
        </div>

        {notice}

        <input
          value={sectionType}
          onChange={(event) => onChange({ section_type: event.target.value })}
          placeholder="Section heading, e.g. Experience"
          aria-label="Section heading"
          className={cn(ghostInput, "block w-full max-w-[calc(100%-9rem)] py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground placeholder:normal-case placeholder:tracking-normal")}
        />

        <div className="mt-1 space-y-11">
          {entries.map((entry, index) => (
            <SectionEntryEditor
              key={`${entry.id}:${versions[entry.id] ?? 0}`}
              entry={entry}
              editors={editors}
              sectionType={sectionType}
              onChange={(changes) => changeEntry(entry.id, changes)}
              onMoveUp={index > 0 ? () => changeEntries((list) => moveEntry(list, entry.id, -1)) : undefined}
              onMoveDown={index < entries.length - 1 ? () => changeEntries((list) => moveEntry(list, entry.id, 1)) : undefined}
              onDelete={
                entries.length > 1 ? () => changeEntries((list) => list.filter((item) => item.id !== entry.id)) : undefined
              }
              canHide={canHideEntries && (entries.length > 1 || entry.hidden)}
              suggestions={suggestionsByEntry.get(entry.id)}
              activeSuggestionId={activeSuggestionId}
              onSuggestionClick={onSuggestionClick}
              onSuggestionClose={onSuggestionClose}
              onSuggestionResolve={onSuggestionResolve}
              onStaleChange={
                onStaleChange && ((ids) => setStaleByEntry((current) => ({ ...current, [entry.id]: ids })))
              }
            />
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => changeEntries((list) => [...list, emptyEntry()])}
          className="-ml-3 mt-9 text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100"
        >
          <PlusIcon />
          Add entry
        </Button>
      </article>

      <ConfirmationModal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDelete}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        variant="destructive"
      />
    </>
  );
};

export default SectionDocument;
