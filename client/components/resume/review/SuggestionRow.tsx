"use client";

import { Button } from "@/components/ui/Button";
import { DONE_LABELS } from "@/lib/resume/reviewPanel";
import { CvSuggestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon, PencilIcon, XIcon } from "lucide-react";
import toast from "react-hot-toast";
import IconAction from "../IconAction";

interface SuggestionRowProps {
  suggestion: CvSuggestion;
  /** "Experience · Acme". */
  label: string;
  /** Pending, but its quote is no longer in the text. */
  stale?: boolean;
  active?: boolean;
  dismissing?: boolean;
  onSelect: () => void;
  onDismiss: () => void;
}

const isNote = (s: CvSuggestion) => s.kind === "note" || s.replacement === null;

/** One pending suggestion in the review panel. Selecting it opens its card in the section. */
const SuggestionRow = ({ suggestion, label, stale, active, dismissing, onSelect, onDismiss }: SuggestionRowProps) => {
  const note = isNote(suggestion);

  const copyReplacement = async () => {
    try {
      await navigator.clipboard.writeText(suggestion.replacement ?? "");
      toast.success("Copied the suggested text");
    } catch {
      toast.error("Couldn't copy the text");
    }
  };

  return (
    <li
      className={cn(
        "rounded-md border border-border transition-colors",
        active ? "border-amber-300 bg-amber-50/60" : "hover:bg-muted/50",
        stale && "bg-muted/30"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className="block w-full min-w-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-md"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium",
              note ? "bg-sky-50 text-sky-900" : "bg-muted text-foreground/80"
            )}
          >
            {note ? "Note" : "Rewrite"}
          </span>
        </span>
        <span className={cn("mt-0.5 line-clamp-1 text-sm", stale && "text-muted-foreground")} title={suggestion.reason}>
          {suggestion.reason}
        </span>
      </button>

      {(stale || note) && (
        <div className="flex items-center gap-1 px-3 pb-2">
          {stale && (
            <span className="mr-auto rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-900">
              Text changed
            </span>
          )}
          {stale && !note && (
            <IconAction label="Copy suggested text" onClick={() => void copyReplacement()} className="size-7">
              <CopyIcon />
            </IconAction>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn("text-muted-foreground hover:text-foreground", !stale && "ml-auto")}
            disabled={dismissing}
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </div>
      )}
    </li>
  );
};

const DONE_ICONS = { accepted: CheckIcon, edited: PencilIcon, rejected: XIcon, superseded: XIcon } as const;

/** A resolved suggestion in the collapsed Done group. */
export const DoneRow = ({ suggestion, label }: { suggestion: CvSuggestion; label: string }) => {
  const status = suggestion.status === "pending" ? "rejected" : suggestion.status;
  const Icon = DONE_ICONS[status];
  return (
    <li className="flex min-w-0 items-center gap-2 px-1 py-1 text-xs text-muted-foreground">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={suggestion.reason}>
        <span className="text-foreground/70">{label}</span> · {suggestion.reason}
      </span>
      <span className="shrink-0">{DONE_LABELS[status]}</span>
    </li>
  );
};

export default SuggestionRow;
