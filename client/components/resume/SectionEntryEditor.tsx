"use client";

import "@/components/richEditor/styles.scss";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { cn } from "@/lib/utils";
import { CvSuggestion, SectionEntry } from "@/lib/types";
import { isEmptyEntry } from "@/lib/resume/sectionEntries";
import { listItems, mergeEdited, visibleContent } from "@/lib/resume/items";
import { findQuote, openSuggestionId } from "@/lib/resume/suggestions";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import { ArrowDownIcon, ArrowUpIcon, CalendarMinusIcon, CalendarPlusIcon, HeadingIcon, TextIcon, Trash2Icon } from "lucide-react";
import { memo, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import toast from "react-hot-toast";
import { BlockToolbar, FormatBubble } from "./EditorControls";
import EntryDetails from "./EntryDetails";
import IconAction from "./IconAction";
import LeaveOutArea from "./LeaveOutArea";
import { normalizeContent } from "./documentContent";
import SuggestionCard, { SuggestionAction } from "./review/SuggestionCard";
import { contentExtensions, replaceInContent } from "./review/replaceInContent";
import { replaceQuote, suggestionRanges } from "./review/SuggestionHighlight";
import { ghostInput } from "./styles";
import { hasDetails, suggestsDetails } from "./sectionDetails";
import { useOpenWhileFocused } from "./useOpenWhileFocused";

const NO_SUGGESTIONS: CvSuggestion[] = [];

const highlightClasses =
  "[&_.cv-suggestion]:cursor-pointer [&_.cv-suggestion]:rounded-sm [&_.cv-suggestion]:bg-amber-100/70 [&_.cv-suggestion]:underline [&_.cv-suggestion]:decoration-amber-500 [&_.cv-suggestion]:decoration-dotted [&_.cv-suggestion]:underline-offset-4 [&_.cv-suggestion-active]:bg-amber-100 [&_.cv-suggestion-active]:decoration-solid";

/** A suggestion's target field; older ones without a field are about the content. */
const fieldOf = (s: CvSuggestion) => s.field ?? "content";

export interface SuggestionProps {
  /** Review suggestions to show. Pending ones are highlighted. */
  suggestions?: CvSuggestion[];
  /**
   * The suggestion whose card is open. When passed (even null) the parent
   * controls the card: set it on onSuggestionClick, clear it on onSuggestionClose.
   * Left undefined, a click on a highlight opens the card locally.
   */
  activeSuggestionId?: number | null;
  onSuggestionClick?: (id: number) => void;
  /** The card closed: Escape, a click away, or after a successful resolve. */
  onSuggestionClose?: () => void;
  /** Records the decision; the text changes here only once this resolves. A rejection is shown as a toast. */
  onSuggestionResolve?: (s: CvSuggestion, action: SuggestionAction, text?: string) => Promise<void>;
}

export type EntryChange = Partial<SectionEntry> | ((latest: SectionEntry) => Partial<SectionEntry>);

interface SectionEntryEditorProps extends SuggestionProps {
  entry: SectionEntry;
  sectionType: string;
  /** From useSectionDrafts. The editor is remounted when it changes. */
  version: number;
  /**
   * A function gets the latest entry, which may be newer than `entry`. Without
   * a version the change isn't the editor's, and is put into it.
   */
  onEntryChange: (id: string, changes: EntryChange, version?: number) => void;
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
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: SectionEntryEditorProps) => {
  const onChange = (changes: EntryChange) => onEntryChange(entry.id, changes, version);
  // A new entry offers its fields; later, empty ones are hidden until asked for.
  const [startedBlank] = useState(() => isEmptyEntry(entry));
  const title = useOpenWhileFocused();
  const summary = useOpenWhileFocused();
  const titleRef = useRef<HTMLInputElement>(null);
  const [openDetails, setOpenDetails] = useState(false);
  const onDetailsOpened = useCallback(() => setOpenDetails(false), []);
  // Remounts the details, which keep half-typed months.
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteNote, setDeleteNote] = useState("");
  const description = entry.description ?? "";
  const showTitle = Boolean(entry.title) || startedBlank || title.open;
  const showSummary = Boolean(description) || summary.open;

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
    setDetailsVersion((count) => count + 1);
    onChange({ role: null, organization: null, location: null, start_date: null, end_date: null, current: false });
  };

  // The editor has ticked items only; the rest are put back into what it reports.
  const [loaded] = useState(() => ({
    content: visibleContent(entry.content),
    hidden: listItems(entry.content).filter((item) => item.off).map((item) => item.id),
  }));
  const editor = useEditor({
    extensions: [
      ...contentExtensions,
      Placeholder.configure({ placeholder: "Write here. Start a line with - for bullets." }),
    ],
    immediatelyRender: false,
    content: loaded.content || "<p></p>",
    editorProps: {
      attributes: {
        "aria-label": "Content",
        class: cn(
          "cv-document-editor outline-none min-h-6 [&_span[data-cv-hidden]]:bg-amber-100 [&_span[data-cv-hidden]]:text-amber-900/80 [&_span[data-cv-hidden]]:line-through [&_span[data-cv-hidden]]:rounded-sm [&_span[data-cv-hidden]]:px-0.5",
          highlightClasses
        ),
      },
    },
    onUpdate: ({ editor: current }) => {
      const visible = current.getHTML();
      onChange((latest) => ({ content: normalizeContent(mergeEdited(latest.content, visible, loaded.hidden)) }));
    },
  });
  useEffect(() => {
    if (!editor) return;
    const shown = editors.current;
    shown.set(entry.id, editor);
    return () => {
      if (shown.get(entry.id) === editor) shown.delete(entry.id);
    };
  }, [editor, editors, entry.id]);

  // --- Review suggestions -------------------------------------------------
  const pending = useMemo(() => suggestions.filter((s) => s.status === "pending"), [suggestions]);
  const contentItems = useMemo(
    () => pending.filter((s) => fieldOf(s) === "content").map((s) => ({ id: s.id, quote: s.quote })),
    [pending]
  );
  // Used as an effect dependency so a new array with the same items is a no-op.
  const contentItemsKey = JSON.stringify(contentItems);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Used only when the parent doesn't control the card (activeSuggestionId undefined).
  const [localOpenId, setLocalOpenId] = useState<number | null>(null);
  const isStale = (s: CvSuggestion): boolean => {
    if (fieldOf(s) === "description") return findQuote(description, s.quote) === null;
    if (!editor) return false;
    return suggestionRanges(editor.state.doc, [{ id: s.id, quote: s.quote }]).get(s.id) === null;
  };

  const cardId = openSuggestionId(activeSuggestionId, localOpenId, (id) => {
    const s = pending.find((p) => p.id === id);
    return s !== undefined && !isStale(s);
  });
  const cardSuggestion = cardId === null ? null : pending.find((s) => s.id === cardId)!;

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // Nothing to show and nothing shown: leave the editor alone.
    if (contentItems.length === 0 && !editor.view.dom.querySelector("[data-suggestion-id]")) return;
    // The active (solid) highlight is the one whose card is open.
    editor.commands.setSuggestions(contentItems, cardId);
    // contentItemsKey stands in for contentItems.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, contentItemsKey, cardId]);

  const cardAnchor = useMemo(() => {
    if (!cardSuggestion || !editor) return null;
    const editorDom = editor.view.dom;
    const fallback = () => (descriptionRef.current ?? editorDom).getBoundingClientRect();
    if (fieldOf(cardSuggestion) === "description") {
      return { getBoundingClientRect: fallback, contextElement: descriptionRef.current ?? undefined };
    }
    const id = cardSuggestion.id;
    return {
      contextElement: editorDom,
      // Highlights are re-rendered as the text changes, so look them up each time.
      getBoundingClientRect: () => {
        const spans = editorDom.querySelectorAll(`[data-suggestion-id="${id}"]`);
        if (spans.length === 0) return fallback();
        const first = spans[0].getBoundingClientRect();
        const last = spans[spans.length - 1].getBoundingClientRect();
        return first.top === last.top ? new DOMRect(first.left, first.top, last.right - first.left, first.height) : first;
      },
    };
  }, [cardSuggestion, editor]);

  const onEditorClick = (event: React.MouseEvent) => {
    const target = (event.target as HTMLElement).closest?.("[data-suggestion-id]");
    if (!target) return;
    const id = Number(target.getAttribute("data-suggestion-id"));
    if (activeSuggestionId === undefined) setLocalOpenId(id);
    onSuggestionClick?.(id);
  };

  const closeCard = () => {
    if (activeSuggestionId === undefined) setLocalOpenId(null);
    onSuggestionClose?.();
  };

  // Records the decision first and changes the text only once it's saved, so
  // a refused request (e.g. the review was replaced elsewhere) leaves the CV
  // as it was.
  const resolveSuggestion = async (s: CvSuggestion, action: SuggestionAction, text?: string) => {
    const changesText = action !== "reject" && text !== undefined;
    if (changesText && isStale(s)) return;
    try {
      await onSuggestionResolve?.(s, action, text);
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Couldn't update the suggestion. Try again."));
      return;
    }
    if (changesText) {
      let changed = false;
      if (fieldOf(s) === "description") {
        // The summary may have been edited while the decision was saving.
        onChange((entryNow) => {
          const latest = entryNow.description ?? "";
          const match = findQuote(latest, s.quote);
          if (!match) return {};
          changed = true;
          return { description: latest.slice(0, match.from) + text + latest.slice(match.to) };
        });
      } else {
        const shown = editors.current.get(entry.id);
        changed = shown !== undefined && replaceQuote(shown, s.quote, text);
        // It may have been unticked while the decision was saving.
        if (!changed) {
          onEntryChange(entry.id, (entryNow) => {
            const replaced = replaceInContent(entryNow.content, s.quote, text);
            if (replaced === null) return {};
            changed = true;
            return { content: replaced };
          });
        }
      }
      if (!changed) toast.error("This text changed meanwhile, so it wasn't replaced.");
    }
    closeCard();
  };

  const content = (
    <EditorContent editor={editor} className="cv-document-body" onClick={pending.length > 0 ? onEditorClick : undefined} />
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
            {!showSummary && (
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
          entry={entry}
          onChange={onChange}
          offered={startedBlank && suggestsDetails(sectionType)}
          openRequested={openDetails}
          onOpened={onDetailsOpened}
        />

        {showSummary && (
          <textarea
            ref={descriptionRef}
            value={description}
            onChange={edit("description")}
            {...summary.focusProps}
            placeholder="Add a one-line summary"
            aria-label="Summary"
            rows={1}
            className={cn(
              ghostInput,
              "field-sizing-content mt-1 block w-full resize-none py-0.5 text-sm text-muted-foreground"
            )}
          />
        )}

        <div className="relative mt-3">
          {editor && <FormatBubble editor={editor} />}
          {editor && onLeaveOut ? (
            <LeaveOutArea
              editor={editor}
              cardOpen={cardSuggestion !== null}
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

      {cardSuggestion && cardAnchor && (
        <SuggestionCard
          key={cardSuggestion.id}
          suggestion={cardSuggestion}
          anchor={cardAnchor}
          onResolve={(action, text) => resolveSuggestion(cardSuggestion, action, text)}
          onClose={closeCard}
        />
      )}

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
