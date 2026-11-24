"use client";

import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { findQuote, openSuggestionId } from "@/lib/resume/suggestions";
import type { CvSuggestion, SectionEntry } from "@/lib/types";
import type { Editor } from "@tiptap/react";
import { RefObject, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { replaceInContent } from "./review/replaceInContent";
import SuggestionCard, { SuggestionAction } from "./review/SuggestionCard";
import { replaceQuote, suggestionRanges } from "./review/SuggestionHighlight";
import type { OnEntryChange } from "./useEntryEditor";

const NO_SUGGESTIONS: CvSuggestion[] = [];

/** For the editor. They leave its layout as it is. */
export const highlightClasses =
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

interface EntrySuggestionsOptions extends SuggestionProps {
  entry: SectionEntry;
  version: number;
  onEntryChange: OnEntryChange;
  editor: Editor | null;
  editors: RefObject<Map<string, Editor>>;
  /** The summary isn't shown, so no card is either. */
  summaryOff: boolean;
  /** The summary's field, where its suggestions' cards open. */
  descriptionRef?: RefObject<HTMLElement | null>;
}

/** Highlights an entry's suggestions in its editor, and gives the open one's card. */
export const useEntrySuggestions = ({
  entry,
  version,
  onEntryChange,
  editor,
  editors,
  summaryOff,
  descriptionRef,
  suggestions = NO_SUGGESTIONS,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
}: EntrySuggestionsOptions) => {
  const description = entry.description ?? "";
  const pending = useMemo(() => suggestions.filter((s) => s.status === "pending"), [suggestions]);
  const contentItems = useMemo(
    () => pending.filter((s) => fieldOf(s) === "content").map((s) => ({ id: s.id, quote: s.quote })),
    [pending]
  );
  // Used as an effect dependency so a new array with the same items is a no-op.
  const contentItemsKey = JSON.stringify(contentItems);

  // Used only when the parent doesn't control the card (activeSuggestionId undefined).
  const [localOpenId, setLocalOpenId] = useState<number | null>(null);
  const isStale = (s: CvSuggestion): boolean => {
    if (fieldOf(s) === "description") return findQuote(description, s.quote) === null;
    if (!editor) return false;
    return suggestionRanges(editor.state.doc, [{ id: s.id, quote: s.quote }]).get(s.id) === null;
  };

  const cardId = openSuggestionId(activeSuggestionId, localOpenId, (id) => {
    const s = pending.find((p) => p.id === id);
    if (s && summaryOff && fieldOf(s) === "description") return false;
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
    const fallback = () => (descriptionRef?.current ?? editorDom).getBoundingClientRect();
    if (fieldOf(cardSuggestion) === "description") {
      return { getBoundingClientRect: fallback, contextElement: descriptionRef?.current ?? undefined };
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
  }, [cardSuggestion, descriptionRef, editor]);

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
        const replaceInSummary = (entryNow: SectionEntry) => {
          const latest = entryNow.description ?? "";
          const match = findQuote(latest, s.quote);
          if (!match) return {};
          changed = true;
          return { description: latest.slice(0, match.from) + text + latest.slice(match.to) };
        };
        onEntryChange(entry.id, replaceInSummary, version);
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

  const card = cardSuggestion && cardAnchor && (
    <SuggestionCard
      key={cardSuggestion.id}
      suggestion={cardSuggestion}
      anchor={cardAnchor}
      onResolve={(action, text) => resolveSuggestion(cardSuggestion, action, text)}
      onClose={closeCard}
    />
  );

  return { card, cardOpen: cardSuggestion !== null, onEditorClick: pending.length > 0 ? onEditorClick : undefined };
};
