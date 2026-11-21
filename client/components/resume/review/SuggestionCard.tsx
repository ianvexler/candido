"use client";

import { Button } from "@/components/ui/Button";
import type { CvSuggestion } from "@/lib/types";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type VirtualElement,
} from "@floating-ui/react";
import { useLayoutEffect, useState } from "react";

export type SuggestionAction = "accept" | "edit" | "reject";

interface SuggestionCardProps {
  suggestion: CvSuggestion;
  /** What the card sits under: the highlight, or the summary input. */
  anchor: VirtualElement;
  onResolve: (action: SuggestionAction, text?: string) => Promise<void>;
  onClose: () => void;
}

/** A small popover for one suggestion: why, what changes, and accept / edit / reject. */
const SuggestionCard = ({ suggestion, anchor, onResolve, onClose }: SuggestionCardProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNote = suggestion.kind === "note" || suggestion.replacement === null;

  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  useLayoutEffect(() => refs.setPositionReference(anchor), [refs, anchor]);
  const { getFloatingProps } = useInteractions([useDismiss(context)]);

  const resolve = async (action: SuggestionAction, text?: string) => {
    setBusy(true);
    try {
      await onResolve(action, text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        role="dialog"
        aria-label="Suggestion"
        className="z-50 w-80 max-w-[calc(100vw-1rem)] space-y-2 rounded-lg border border-border bg-background p-3 text-sm shadow-lg"
      >
        <p className="font-medium leading-snug">{suggestion.reason}</p>

        {!isNote && (
          <div className="space-y-1 text-[13px] leading-snug">
            <p className="flex gap-1.5 text-muted-foreground">
              <span aria-label="Remove" className="select-none text-red-600">−</span>
              <span className="line-through decoration-red-300">{suggestion.quote}</span>
            </p>
            {draft === null ? (
              <p className="flex gap-1.5">
                <span aria-label="Add" className="select-none text-emerald-600">+</span>
                <span>{suggestion.replacement}</span>
              </p>
            ) : (
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="Replacement text"
                rows={2}
                className="field-sizing-content block w-full resize-none rounded-md bg-muted/60 px-2 py-1 outline-none focus:ring-2 focus:ring-ring/40"
              />
            )}
          </div>
        )}

        <div className="flex gap-1 pt-1">
          {isNote ? (
            <Button size="xs" variant="outline" disabled={busy} onClick={() => void resolve("reject")}>
              Dismiss
            </Button>
          ) : draft === null ? (
            <>
              <Button size="xs" disabled={busy} onClick={() => void resolve("accept", suggestion.replacement ?? "")}>
                Accept
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDraft(suggestion.replacement ?? "")}>
                Edit
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => void resolve("reject")}>
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" disabled={busy || !draft.trim()} onClick={() => void resolve("edit", draft.trim())}>
                Apply
              </Button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
};

export default SuggestionCard;
