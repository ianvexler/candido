import type { CvSuggestion, CvTailoring } from "@/lib/types";

const WHITESPACE = /[\s ]+/;

/**
 * Finds `quote` in `text`, treating any run of whitespace (including
 * non-breaking spaces) on either side as matching any run on the other.
 * Returns offsets into the original `text`, or null if absent or blank.
 */
export const findQuote = (text: string, quote: string): { from: number; to: number } | null => {
  const words = quote.split(WHITESPACE).filter(Boolean);
  if (words.length === 0) return null;

  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(words.map(escape).join("[\\s\\u00A0]+")).exec(text);
  if (!match) return null;
  return { from: match.index, to: match.index + match[0].length };
};

const byPosition = (a: CvSuggestion, b: CvSuggestion) => (a.position ?? 0) - (b.position ?? 0);

/** Groups suggestions: pending ones that still match the text (open) or not (stale), and resolved ones (done). */
export const splitSuggestions = (
  suggestions: CvSuggestion[],
  isStale: (s: CvSuggestion) => boolean,
): { open: CvSuggestion[]; stale: CvSuggestion[]; done: CvSuggestion[] } => {
  const sorted = [...suggestions].sort(byPosition);
  const pending = sorted.filter((s) => s.status === "pending");
  return {
    open: pending.filter((s) => !isStale(s)),
    stale: pending.filter(isStale),
    done: sorted.filter((s) => s.status !== "pending"),
  };
};

export const isTailoringActive = (t: CvTailoring | null): boolean =>
  t !== null && (t.status === "pending" || t.status === "processing");

/**
 * Which suggestion card is open. A parent that passes an id (or null) controls
 * it; undefined falls back to the local id. Only openable ids open, e.g. this
 * section's pending, non-stale suggestions.
 */
export const openSuggestionId = (
  controlledId: number | null | undefined,
  localId: number | null,
  openable: (id: number) => boolean,
): number | null => {
  const id = controlledId !== undefined ? controlledId : localId;
  return id !== null && openable(id) ? id : null;
};
