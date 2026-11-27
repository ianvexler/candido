"use client";

import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { tickItem } from "@/lib/resume/checklist";
import { emptyEntry, moveEntry } from "@/lib/resume/sectionEntries";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import type { TransferTarget } from "@/lib/resume/transfer";
import { SUMMARY_ID, CvSuggestion, SectionEntry, SectionFields } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { ReactNode, RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { rowBox, rowIdOf } from "./ChecklistRow";
import { EditChannelContext } from "./editChannel";
import IconAction from "./IconAction";
import LibrarySectionMenu from "./library/LibrarySectionMenu";
import { CV_LOOK, LIBRARY_LOOK } from "./sectionLooks";
import { LabelStyles, LibraryLabelling } from "./library/LabelArea";
import { focusText } from "./placeCaret";
import SectionEntryEditor from "./SectionEntryEditor";
import { ghostInput } from "./styles";
import type { EntryChange } from "./useEntryEditor";
import type { SuggestionProps } from "./useEntrySuggestions";

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
  /** What deleting it, or one of its entries, means. Asked when that is about to be confirmed. */
  describeDeletion: (entryId?: string) => string;
  /** Shown above the section, e.g. which column it's in. */
  notice?: ReactNode;
  /** Shows what is ticked only. Order is up to the checklist. */
  inCv?: boolean;
  /** In a CV: nothing can be left out now, while its purpose changes. */
  leaveOutLocked?: boolean;
  /** In the library: labelling items and entries with purposes. */
  library?: LibraryLabelling;
}

const FOCUS_FRAMES = 20;

const isVisible = (element: HTMLElement) => element.checkVisibility?.({ visibilityProperty: true }) ?? true;

/** For when the entry went with its last item: its row in the checklist, or what is left of the page. */
const focusElsewhere = (target: TransferTarget) => {
  if (document.activeElement !== document.body) return;
  const heading = document.querySelector<HTMLElement>(
    `[data-section-id="${target.sectionId}"] input[aria-label="Section heading"]`
  );
  const papers = document.querySelectorAll<HTMLElement>('[data-section-id] input[aria-label="Section heading"]');
  [rowBox(rowIdOf(target)), heading, ...papers, document.querySelector<HTMLElement>("[data-add-sheet]")]
    .find((element) => element !== null && element !== undefined && isVisible(element))
    ?.focus();
};

/** Focuses the editor that replaces `before`, near a position, once it's there. */
const focusNext = (
  target: TransferTarget,
  editors: RefObject<Map<string, Editor>>,
  before: Editor | undefined,
  position: number
) => {
  let frames = 0;
  const attempt = () => {
    const editor = editors.current.get(target.entryId);
    if (!editor || editor === before || editor.isDestroyed) {
      if (++frames < FOCUS_FRAMES) requestAnimationFrame(attempt);
      else focusElsewhere(target);
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
  describeDeletion,
  notice,
  inCv = false,
  leaveOutLocked = false,
  library,
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: SectionDocumentProps) => {
  const { id: sectionId, section_type: sectionType, entries } = section;
  const shown = inCv ? entries.filter((entry) => !entry.hidden) : entries;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteNote, setDeleteNote] = useState("");
  const editors = useRef(new Map<string, Editor>());
  const entryLibrary = useMemo(() => library && { ...library, sectionId }, [library, sectionId]);
  const look = library ? LIBRARY_LOOK : CV_LOOK;
  const headingRef = useRef<HTMLInputElement>(null);
  const channel = useContext(EditChannelContext);

  useEffect(
    () =>
      channel?.handle((target) => {
        if (target.what !== "heading" || target.sectionId !== sectionId || !headingRef.current) return false;
        focusText(headingRef.current, target.selected);
        return true;
      }),
    [channel, sectionId]
  );

  const changeEntries = useCallback(
    (change: (entries: SectionEntry[]) => SectionEntry[], editor?: EntryEditor) =>
      onChange((current) => ({ entries: change(current.entries) }), editor),
    [onChange]
  );
  const changeEntry = useCallback(
    (id: string, changes: EntryChange, version?: number, gone?: boolean) =>
      changeEntries(
        (list) =>
          list.map((entry) =>
            entry.id === id ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
          ),
        version === undefined ? undefined : { entryId: id, version, gone }
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
  const latestDescribe = useRef(describeDeletion);
  useEffect(() => {
    latestDescribe.current = describeDeletion;
  });
  // Stays the same, for the entries' memo.
  const describeEntry = useCallback((id: string) => latestDescribe.current(id), []);
  const askDelete = () => {
    setDeleteNote(describeDeletion());
    setDeleteOpen(true);
  };
  const leaveOut = useCallback(
    (entryId: string, itemId: string, focusAt: number | null) => {
      const before = editors.current.get(entryId);
      onChange((current) => tickItem(current, entryId, itemId, false));
      if (focusAt === null) return;
      // Its text isn't in the editor, which stays.
      if (itemId === SUMMARY_ID) requestAnimationFrame(() => focusElsewhere({ sectionId, entryId, itemId }));
      else focusNext({ sectionId, entryId, itemId }, editors, before, focusAt);
    },
    [onChange, sectionId]
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
        className={cn("group/section relative mx-auto w-full max-w-2xl", look.article)}
      >
        {!library && (
          <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100">
            <IconAction label={deleteLabel} onClick={askDelete}>
              <Trash2Icon />
            </IconAction>
          </div>
        )}

        {notice}
        {library && <LabelStyles sectionId={sectionId} entries={entries} library={library} />}

        <div className={look.headingRow}>
          <input
            ref={headingRef}
            value={sectionType}
            onChange={(event) => onChange({ section_type: event.target.value })}
            placeholder={look.headingPlaceholder}
            aria-label="Section heading"
            className={cn(ghostInput, look.heading)}
          />
          {library && <LibrarySectionMenu heading={sectionType} deleteLabel={deleteLabel} onDelete={askDelete} />}
        </div>
        {library && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
          </p>
        )}

        <div className={look.entries}>
          {shown.map((entry) => {
            const index = entries.indexOf(entry);
            const version = versions[entry.id] ?? 0;
            return (
              <SectionEntryEditor
                key={`${entry.id}:${version}`}
                sectionId={sectionId}
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
                describeDeletion={describeEntry}
                onLeaveOut={inCv ? leaveOut : undefined}
                leaveOutLocked={leaveOutLocked}
                library={entryLibrary}
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
          className={look.addEntry}
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
        description={deleteNote}
        confirmLabel="Delete"
        variant="destructive"
      />
    </>
  );
};

export default SectionDocument;
