"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { cleanFields, emptyEntry, endsBeforeStart, moveEntry, sameFields } from "@/lib/resume/sectionEntries";
import { markPending, markSettled, trackSave } from "@/lib/resume/saveTracker";
import { CvSuggestion, SectionEntry, SectionFields } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { ReactNode, Ref, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import IconAction from "./IconAction";
import SectionEntryEditor, { SuggestionProps } from "./SectionEntryEditor";
import { ghostInput } from "./styles";

const SAVE_DELAY_MS = 600;
const NO_SUGGESTIONS: CvSuggestion[] = [];

interface SectionDocumentProps<T extends SectionFields & { id: number }> extends SuggestionProps {
  section: T;
  /** Persists the fields and resolves with the saved record. */
  save: (fields: SectionFields) => Promise<T>;
  onSaved: (next: T) => void;
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
 * section is hovered, focused or text is selected. Edits autosave after a pause.
 * The editors are uncontrolled: remount this (change its key) to load new content.
 */
const SectionDocument = <T extends SectionFields & { id: number }>({
  section,
  save,
  onSaved,
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
}: SectionDocumentProps<T>) => {
  const [sectionType, setSectionType] = useState(section.section_type);
  const [entries, setEntries] = useState<SectionEntry[]>(() =>
    section.entries.length > 0 ? section.entries : [emptyEntry()]
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Bumped on every edit; a non-zero value means there are unsaved changes.
  const [dirty, setDirty] = useState(0);
  const markDirty = () => setDirty((count) => count + 1);

  const changeEntries = (change: (entries: SectionEntry[]) => SectionEntry[]) => {
    setEntries(change);
    markDirty();
  };
  const changeEntry = (id: string, changes: Partial<SectionEntry>) =>
    changeEntries((list) => list.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));

  // Export waits on unsaved edits (this key) and on save requests (trackSave).
  const editKey = `section-${section.id}:edit`;

  // Unmounting cancels the debounce, so the edit will never be saved; requests
  // already sent settle on their own.
  useEffect(() => () => markSettled(editKey), [editKey]);

  useEffect(() => {
    if (dirty === 0) {
      markSettled(editKey);
      return;
    }
    markPending(editKey);

    const timer = setTimeout(() => {
      setDirty(0);
      // Shown inline; the server would reject it anyway.
      if (entries.some(endsBeforeStart)) {
        markSettled(editKey);
        return;
      }
      const fields = cleanFields(sectionType, entries);
      // Editor housekeeping (e.g. its trailing paragraph) can fire updates
      // without any real change; saving those would mark CV copies as stale.
      if (sameFields(fields, section)) {
        markSettled(editKey);
        return;
      }

      const request = trackSave(`section-${section.id}`, save(fields));
      markSettled(editKey);
      void request
        .then(onSaved)
        .catch((error) => {
          console.error(error);
          toast.error(error?.response?.data?.error ?? "Couldn't save this section. Check your connection and try again.");
        });
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [dirty, sectionType, entries, section, save, onSaved, editKey]);

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

  const onConfirmDelete = async () => {
    setDirty(0);
    await onDelete();
  };

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
          onChange={(event) => {
            setSectionType(event.target.value);
            markDirty();
          }}
          placeholder="Section heading, e.g. Experience"
          aria-label="Section heading"
          className={cn(ghostInput, "block w-full max-w-[calc(100%-9rem)] py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground placeholder:normal-case placeholder:tracking-normal")}
        />

        <div className="mt-1 space-y-11">
          {entries.map((entry, index) => (
            <SectionEntryEditor
              key={entry.id}
              entry={entry}
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
        onConfirm={onConfirmDelete}
        title={deleteTitle}
        description={deleteDescription}
        confirmLabel="Delete"
        variant="destructive"
      />
    </>
  );
};

export default SectionDocument;
