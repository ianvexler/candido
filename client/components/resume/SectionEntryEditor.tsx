"use client";

import "@/components/richEditor/styles.scss";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { CvSuggestion, SectionEntry } from "@/lib/types";
import { endsBeforeStart, isEmptyEntry } from "@/lib/resume/sectionEntries";
import { listItems, mergeEdited, visibleContent } from "@/lib/resume/items";
import { findQuote, openSuggestionId } from "@/lib/resume/suggestions";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import Link from "@tiptap/extension-link";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { ArrowDownIcon, ArrowUpIcon, CalendarMinusIcon, CalendarPlusIcon, Trash2Icon } from "lucide-react";
import { memo, RefObject, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { BlockToolbar, FormatBubble } from "./EditorControls";
import CvItem from "./CvItem";
import HiddenMark from "./HiddenMark";
import IconAction from "./IconAction";
import LeaveOutArea from "./LeaveOutArea";
import { normalizeContent } from "./documentContent";
import SuggestionCard, { SuggestionAction } from "./review/SuggestionCard";
import { SuggestionHighlight, replaceQuote, suggestionRanges } from "./review/SuggestionHighlight";
import { ghostInput } from "./styles";
import { fromMonthInput, hasDetails, suggestsDetails, toMonthInput } from "./sectionDetails";

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
  /** A function gets the latest entry, which may be newer than `entry`. */
  onEntryChange: (id: string, changes: EntryChange, version: number) => void;
  /** The editor on screen for each entry, as it may have been remounted since. */
  editors: RefObject<Map<string, Editor>>;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove: (id: string, by: -1 | 1) => void;
  /** False for a section's only entry: delete the section instead. */
  canDelete: boolean;
  onDelete: (id: string) => void;
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
  onLeaveOut,
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: SectionEntryEditorProps) => {
  const onChange = (changes: EntryChange) => onEntryChange(entry.id, changes, version);
  // Kept as typed: a half-typed month isn't a date yet.
  const [startMonth, setStartMonth] = useState(toMonthInput(entry.start_date));
  const [endMonth, setEndMonth] = useState(toMonthInput(entry.end_date));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const description = entry.description ?? "";
  const endBeforeStart = endsBeforeStart(entry);
  const showDetails = detailsOpen || hasDetails(entry) || suggestsDetails(sectionType);

  const edit =
    (field: "title" | "role" | "organization" | "location" | "description") =>
    (event: { target: { value: string } }) =>
      onChange({ [field]: event.target.value });

  const clearDetails = () => {
    setStartMonth("");
    setEndMonth("");
    setDetailsOpen(false);
    onChange({ role: null, organization: null, location: null, start_date: null, end_date: null, current: false });
  };

  // The editor has ticked items only; the rest are put back into what it reports.
  const [loaded] = useState(() => ({
    content: visibleContent(entry.content),
    hidden: listItems(entry.content).filter((item) => item.off).map((item) => item.id),
  }));
  const editor = useEditor({
    extensions: [
      TextStyleKit,
      StarterKit,
      Link.configure({ openOnClick: false }),
      HiddenMark,
      CvItem,
      SuggestionHighlight,
      Placeholder.configure({ placeholder: "Write here. Start a line with - for bullets." }),
    ],
    immediatelyRender: false,
    content: loaded.content || "<p></p>",
    editorProps: {
      attributes: {
        "aria-label": "Content",
        class: cn(
          "cv-document-editor outline-none min-h-16 [&_span[data-cv-hidden]]:bg-amber-100 [&_span[data-cv-hidden]]:text-amber-900/80 [&_span[data-cv-hidden]]:line-through [&_span[data-cv-hidden]]:rounded-sm [&_span[data-cv-hidden]]:px-0.5",
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
      if (fieldOf(s) === "description") {
        // The summary may have been edited while the decision was saving.
        onChange((entryNow) => {
          const latest = entryNow.description ?? "";
          const match = findQuote(latest, s.quote);
          return match ? { description: latest.slice(0, match.from) + text + latest.slice(match.to) } : {};
        });
      } else {
        const shown = editors.current.get(entry.id);
        if (shown) replaceQuote(shown, s.quote, text);
      }
    }
    closeCard();
  };

  const content = (
    <EditorContent editor={editor} className="cv-document-body" onClick={pending.length > 0 ? onEditorClick : undefined} />
  );

  return (
    <>
      <div data-entry-id={entry.id} className="group/entry relative">
        <div className="flex items-start justify-between gap-2">
          <input
            value={entry.title}
            onChange={edit("title")}
            placeholder="Title"
            aria-label="Title"
            className={cn(
              ghostInput,
              "block flex-1 py-0.5 text-xl font-semibold",
              "placeholder:opacity-0 group-hover/entry:placeholder:opacity-100 group-focus-within/entry:placeholder:opacity-100"
            )}
          />
          <div className="-mr-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100">
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
            {showDetails && !suggestsDetails(sectionType) ? (
              <IconAction label="Remove role and dates" onClick={clearDetails}>
                <CalendarMinusIcon />
              </IconAction>
            ) : !showDetails ? (
              <IconAction label="Add role and dates" onClick={() => setDetailsOpen(true)}>
                <CalendarPlusIcon />
              </IconAction>
            ) : null}
            {canDelete && (
              <IconAction
                label="Delete entry"
                onClick={() => (isEmptyEntry(entry) ? onDelete(entry.id) : setDeleteOpen(true))}
              >
                <Trash2Icon />
              </IconAction>
            )}
          </div>
        </div>

        {showDetails && (
          <div
            className={cn(
              "mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 text-sm",
              // Nothing filled in: only offer it when the entry is being looked at or edited.
              !hasDetails(entry) && "opacity-0 group-hover/entry:opacity-100 group-focus-within/entry:opacity-100"
            )}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <input
                value={entry.role ?? ""}
                onChange={edit("role")}
                placeholder="Role or degree"
                aria-label="Role or degree"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5 font-medium")}
              />
              <span aria-hidden className="text-muted-foreground/60">at</span>
              <input
                value={entry.organization ?? ""}
                onChange={edit("organization")}
                placeholder="Organisation"
                aria-label="Organisation or school"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
              <input
                type="month"
                value={startMonth}
                onChange={(event) => {
                  setStartMonth(event.target.value);
                  onChange({ start_date: fromMonthInput(event.target.value) });
                }}
                aria-label="Start month"
                className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5")}
              />
              <span aria-hidden>–</span>
              {entry.current ? (
                <span className="px-1 py-0.5 text-foreground">Present</span>
              ) : (
                <input
                  type="month"
                  value={endMonth}
                  min={startMonth || undefined}
                  onChange={(event) => {
                    setEndMonth(event.target.value);
                    onChange({ end_date: fromMonthInput(event.target.value) });
                  }}
                  aria-label="End month"
                  aria-invalid={endBeforeStart || undefined}
                  className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5", endBeforeStart && "text-destructive")}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={entry.current}
                    onClick={() => onChange({ current: !entry.current })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs transition-colors",
                      entry.current
                        ? "border-transparent bg-muted text-foreground"
                        : "border-dashed border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Current
                  </button>
                </TooltipTrigger>
                <TooltipContent>{entry.current ? "Set an end date instead" : "Still here? Show the end date as Present"}</TooltipContent>
              </Tooltip>
              <input
                value={entry.location ?? ""}
                onChange={edit("location")}
                placeholder="Location"
                aria-label="Location"
                className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
              />
            </div>
            {endBeforeStart && (
              <p role="alert" className="w-full text-xs text-destructive">
                The end month is before the start month, so this isn&apos;t saved yet.
              </p>
            )}
          </div>
        )}

        <textarea
          ref={descriptionRef}
          value={description}
          onChange={edit("description")}
          placeholder="Add a one-line summary"
          aria-label="Summary"
          rows={1}
          className={cn(
            ghostInput,
            "field-sizing-content mt-1 block w-full resize-none py-0.5 text-sm text-muted-foreground",
            // Only suggest a summary when the section is being looked at or edited.
            "placeholder:opacity-0 group-hover/entry:placeholder:opacity-100 group-focus-within/entry:placeholder:opacity-100"
          )}
        />

        <div className="relative mt-4">
          {editor && <FormatBubble editor={editor} />}
          {editor && onLeaveOut ? (
            <LeaveOutArea editor={editor} onLeaveOut={(itemId, focusAt) => onLeaveOut(entry.id, itemId, focusAt)}>
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
          description={
            onLeaveOut
              ? "Only this CV's copy is deleted. To keep it here but not show it, untick it instead."
              : "This removes it from the library section. CVs that already use it keep their copy."
          }
          confirmLabel="Delete"
          variant="destructive"
        />
      )}
    </>
  );
};

export default memo(SectionEntryEditor);
