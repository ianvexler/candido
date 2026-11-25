"use client";

import "@/components/richEditor/styles.scss";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { cn } from "@/lib/utils";
import { SUMMARY_ID, SectionEntry } from "@/lib/types";
import { MonthDraftsContext } from "@/lib/resume/monthDrafts";
import { isEmptyEntry } from "@/lib/resume/sectionEntries";
import { Editor, EditorContent } from "@tiptap/react";
import { ArrowDownIcon, ArrowUpIcon, CalendarMinusIcon, CalendarPlusIcon, HeadingIcon, TextIcon, Trash2Icon } from "lucide-react";
import { memo, RefObject, useCallback, useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { withoutBlankEnd } from "./addBullet";
import { EditChannelContext, EditTarget } from "./editChannel";
import { BlockToolbar, FormatBubble } from "./EditorControls";
import EntryDetails from "./EntryDetails";
import IconAction from "./IconAction";
import LeaveOutArea from "./LeaveOutArea";
import { editInEditor, focusText } from "./placeCaret";
import { LEAVE_OUT_BUTTON, LEAVE_OUT_SPACE, ghostInput } from "./styles";
import { hasDetails, suggestsDetails } from "./sectionDetails";
import { EntryChange, OnEntryChange, useEntryEditor } from "./useEntryEditor";
import { highlightClasses, SuggestionProps, useEntrySuggestions } from "./useEntrySuggestions";
import { useOpenWhileFocused } from "./useOpenWhileFocused";

interface SectionEntryEditorProps extends SuggestionProps {
  sectionId: number;
  entry: SectionEntry;
  sectionType: string;
  /** From useSectionDrafts. The editor is remounted when it changes. */
  version: number;
  onEntryChange: OnEntryChange;
  /** The editor on screen for each entry, as it may have been remounted since. */
  editors: RefObject<Map<string, Editor>>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove: (id: string, by: -1 | 1) => void;
  /** False for a section's only entry: delete the section instead. */
  canDelete: boolean;
  onDelete: (id: string) => void;
  describeDeletion: (id: string) => string;
  /** In a CV: offers leaving items out; see LeaveOutArea. */
  onLeaveOut?: (entryId: string, itemId: string, focusAt: number | null) => void;
}

/**
 * One entry of a section: title, role and dates, summary and content.
 * The text editor is uncontrolled: remount it to load new content.
 */
const SectionEntryEditor = ({
  sectionId,
  entry,
  sectionType,
  version,
  onEntryChange,
  editors,
  canMoveUp = false,
  canMoveDown = false,
  onMove,
  canDelete,
  onDelete,
  describeDeletion,
  onLeaveOut,
  ...suggestionProps
}: SectionEntryEditorProps) => {
  const onChange = (changes: EntryChange) => onEntryChange(entry.id, changes, version);
  // A new entry offers its fields; later, empty ones are hidden until asked for.
  const [startedBlank] = useState(() => isEmptyEntry(entry));
  const title = useOpenWhileFocused();
  const summary = useOpenWhileFocused();
  const titleRef = useRef<HTMLInputElement>(null);
  const [openDetails, setOpenDetails] = useState(false);
  const onDetailsOpened = useCallback(() => setOpenDetails(false), []);
  const monthDrafts = useContext(MonthDraftsContext);
  // Remounts the details, which keep half-typed months.
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteNote, setDeleteNote] = useState("");
  const description = entry.description ?? "";
  const showTitle = Boolean(entry.title) || startedBlank || title.open;
  const summaryOff = onLeaveOut !== undefined && Boolean(entry.description_off && description.trim());
  const showSummary = !summaryOff && (Boolean(description) || summary.open);

  const edit =
    (field: "title" | "description") =>
    (event: { target: { value: string } }) =>
      onChange({ [field]: event.target.value });

  const openAndFocus = (setOpen: (open: boolean) => void, field: RefObject<HTMLElement | null>) => {
    flushSync(() => setOpen(true));
    field.current?.focus();
  };

  const askDelete = () => {
    if (isEmptyEntry(entry)) return onDelete(entry.id);
    setDeleteNote(describeDeletion(entry.id));
    setDeleteOpen(true);
  };

  const clearDetails = () => {
    monthDrafts?.clear({ sectionId, entryId: entry.id });
    setDetailsVersion((count) => count + 1);
    onChange({ role: null, organization: null, location: null, start_date: null, end_date: null, current: false });
  };

  const editor = useEntryEditor({
    entry,
    version,
    onChange: onEntryChange,
    editors,
    placeholder: "Write here. Start a line with - for bullets.",
    className: cn(
      "cv-document-editor outline-none min-h-6 [&_span[data-cv-hidden]]:bg-amber-100 [&_span[data-cv-hidden]]:text-amber-900/80 [&_span[data-cv-hidden]]:line-through [&_span[data-cv-hidden]]:rounded-sm [&_span[data-cv-hidden]]:px-0.5",
      highlightClasses
    ),
  });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const { card, cardOpen, onEditorClick } = useEntrySuggestions({
    entry,
    version,
    onEntryChange,
    editor,
    editors,
    summaryOff,
    descriptionRef,
    ...suggestionProps,
  });

  const goTo = (target: EditTarget): boolean => {
    if (target.what === "heading" || target.sectionId !== sectionId || target.entryId !== entry.id) return false;
    if (target.what === "details") {
      setOpenDetails(true);
      return true;
    }
    if (target.what === "title" || target.what === "summary") {
      if (target.what === "summary" && summaryOff) return false;
      const isTitle = target.what === "title";
      const field = isTitle ? titleRef : descriptionRef;
      if (!field.current) flushSync(() => (isTitle ? title : summary).setOpen(true));
      if (field.current) focusText(field.current);
      return field.current !== null;
    }
    if (!editor || editor.isDestroyed) return false;
    // Without its version, so that an editor that has it loads anew.
    const drop = (latest: SectionEntry) => ({ content: withoutBlankEnd(latest.content) });
    return editInEditor(editor, target, () => onEntryChange(entry.id, drop));
  };
  const onTarget = useEffectEvent(goTo);
  const channel = useContext(EditChannelContext);
  useEffect(() => channel?.handle((target) => onTarget(target)), [channel]);

  const content = (
    <EditorContent editor={editor} className="cv-document-body" onClick={onEditorClick} />
  );

  return (
    <>
      <div data-entry-id={entry.id} className="group/entry relative">
        <div className={cn("flex items-start justify-between gap-2", !showTitle && "h-0")}>
          {showTitle && (
            <input
              ref={titleRef}
              value={entry.title}
              onChange={edit("title")}
              {...title.focusProps}
              placeholder="Title"
              aria-label="Title"
              className={cn(ghostInput, "block flex-1 py-0.5 text-xl font-semibold")}
            />
          )}
          <div
            className={cn(
              "-mr-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100",
              // Without a title line, in the space above.
              !showTitle && "absolute -top-8 right-0"
            )}
          >
            {!showTitle && (
              <IconAction label="Add title" onClick={() => openAndFocus(title.setOpen, titleRef)}>
                <HeadingIcon />
              </IconAction>
            )}
            {!showSummary && !summaryOff && (
              <IconAction label="Add a one-line summary" onClick={() => openAndFocus(summary.setOpen, descriptionRef)}>
                <TextIcon />
              </IconAction>
            )}
            {canMoveUp && (
              <IconAction label="Move entry up" onClick={() => onMove(entry.id, -1)}>
                <ArrowUpIcon />
              </IconAction>
            )}
            {canMoveDown && (
              <IconAction label="Move entry down" onClick={() => onMove(entry.id, 1)}>
                <ArrowDownIcon />
              </IconAction>
            )}
            {!hasDetails(entry) && (
              <IconAction label="Add role and dates" onClick={() => setOpenDetails(true)}>
                <CalendarPlusIcon />
              </IconAction>
            )}
            {hasDetails(entry) && !suggestsDetails(sectionType) && (
              <IconAction label="Remove role and dates" onClick={clearDetails}>
                <CalendarMinusIcon />
              </IconAction>
            )}
            {canDelete && (
              <IconAction
                label="Delete entry"
                onClick={askDelete}
              >
                <Trash2Icon />
              </IconAction>
            )}
          </div>
        </div>

        <EntryDetails
          key={detailsVersion}
          sectionId={sectionId}
          entry={entry}
          onChange={onChange}
          offered={startedBlank && suggestsDetails(sectionType)}
          openRequested={openDetails}
          onOpened={onDetailsOpened}
        />

        {showSummary && (
          <div
            className={cn("group/summary relative mt-1", onLeaveOut && LEAVE_OUT_SPACE)}
            {...summary.focusProps}
          >
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={edit("description")}
              placeholder="Add a one-line summary"
              aria-label="Summary"
              rows={1}
              className={cn(
                ghostInput,
                "field-sizing-content block w-full resize-none py-0.5 text-sm text-muted-foreground"
              )}
            />
            {onLeaveOut && description.trim() && (
              <button
                type="button"
                aria-label="Leave out the summary"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  const focused = event.currentTarget.parentElement?.contains(document.activeElement);
                  summary.setOpen(false);
                  onLeaveOut(entry.id, SUMMARY_ID, focused ? 0 : null);
                }}
                className={cn(
                  LEAVE_OUT_BUTTON,
                  "pointer-events-none top-0 opacity-0 group-focus-within/summary:pointer-events-auto group-focus-within/summary:opacity-100 group-hover/summary:pointer-events-auto group-hover/summary:opacity-100"
                )}
              >
                Leave out
              </button>
            )}
          </div>
        )}

        <div className="relative mt-3">
          {editor && <FormatBubble editor={editor} />}
          {editor && onLeaveOut ? (
            <LeaveOutArea
              editor={editor}
              cardOpen={cardOpen}
              onLeaveOut={(itemId, focusAt) => onLeaveOut(entry.id, itemId, focusAt)}
            >
              {content}
            </LeaveOutArea>
          ) : (
            content
          )}
          {editor && (
            <BlockToolbar
              editor={editor}
              className="pointer-events-none absolute -bottom-9 left-0 opacity-0 transition-opacity group-focus-within/entry:pointer-events-auto group-focus-within/entry:opacity-100"
            />
          )}
        </div>
      </div>

      {card}

      {canDelete && (
        <ConfirmationModal
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => onDelete(entry.id)}
          title="Delete this entry?"
          description={deleteNote}
          confirmLabel="Delete"
          variant="destructive"
        />
      )}
    </>
  );
};

export default memo(SectionEntryEditor);
