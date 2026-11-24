"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { tickItem } from "@/lib/resume/checklist";
import { emptyEntry, moveEntry } from "@/lib/resume/sectionEntries";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import { CvSuggestion, SectionEntry, SectionFields } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { ReactNode, RefObject, useCallback, useMemo, useRef, useState } from "react";
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
  /** Shown above the section, e.g. which column it's in. */
  notice?: ReactNode;
  /** Shows what is ticked only. Order is up to the checklist. */
  inCv?: boolean;
}

const FOCUS_FRAMES = 20;

/** Focuses the editor that replaces `before`, near a position, once it's there. */
const focusNext = (
  editors: RefObject<Map<string, Editor>>,
  entryId: string,
  before: Editor | undefined,
  position: number
) => {
  let frames = 0;
  const attempt = () => {
    const editor = editors.current.get(entryId);
    if (!editor || editor === before || editor.isDestroyed) {
      if (++frames < FOCUS_FRAMES) requestAnimationFrame(attempt);
      return;
    }
    const { tr, doc } = editor.state;
    editor.view.dispatch(tr.setSelection(Selection.near(doc.resolve(Math.min(position, doc.content.size)), -1)));
    editor.view.focus();
  };
  requestAnimationFrame(attempt);
};

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
  notice,
  inCv = false,
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: SectionDocumentProps) => {
  const { section_type: sectionType, entries } = section;
  const shown = inCv ? entries.filter((entry) => !entry.hidden) : entries;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editors = useRef(new Map<string, Editor>());

  const changeEntries = useCallback(
    (change: (entries: SectionEntry[]) => SectionEntry[], editor?: EntryEditor) =>
      onChange((current) => ({ entries: change(current.entries) }), editor),
    [onChange]
  );
  const changeEntry = useCallback(
    (id: string, changes: EntryChange, version: number) =>
      changeEntries(
        (list) =>
          list.map((entry) =>
            entry.id === id ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
          ),
        { entryId: id, version }
      ),
    [changeEntries]
  );
  const move = useCallback(
    (id: string, by: -1 | 1) => changeEntries((list) => moveEntry(list, id, by)),
    [changeEntries]
  );
  const deleteEntry = useCallback(
    (id: string) => changeEntries((list) => list.filter((entry) => entry.id !== id)),
    [changeEntries]
  );
  const leaveOut = useCallback(
    (entryId: string, itemId: string, focusAt: number | null) => {
      const before = editors.current.get(entryId);
      onChange((current) => tickItem(current, entryId, itemId, false));
      if (focusAt !== null) focusNext(editors, entryId, before, focusAt);
    },
    [onChange]
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

  return (
    <>
      <article
        data-section-id={section.id}
        className="group/section relative mx-auto w-full max-w-2xl bg-white px-10 pb-6 pt-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14"
      >
        <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
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
          {shown.map((entry) => {
            const index = entries.indexOf(entry);
            const version = versions[entry.id] ?? 0;
            return (
              <SectionEntryEditor
                key={`${entry.id}:${version}`}
                entry={entry}
                version={version}
                editors={editors}
                sectionType={sectionType}
                onEntryChange={changeEntry}
                canMoveUp={!inCv && index > 0}
                canMoveDown={!inCv && index < entries.length - 1}
                onMove={move}
                canDelete={entries.length > 1}
                onDelete={deleteEntry}
                onLeaveOut={inCv ? leaveOut : undefined}
                suggestions={suggestionsByEntry.get(entry.id)}
                activeSuggestionId={activeSuggestionId}
                onSuggestionClick={onSuggestionClick}
                onSuggestionClose={onSuggestionClose}
                onSuggestionResolve={onSuggestionResolve}
              />
            );
          })}
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
