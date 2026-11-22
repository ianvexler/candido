import type { CvSuggestion, CvSuggestionStatus, CvTailoringReport } from "@/lib/types";
import { splitSuggestions } from "./suggestions";

export const FIT_LABELS: Record<CvTailoringReport["fit"], string> = {
  strong: "Strong",
  partial: "Partial",
  weak: "Weak",
};

export const COVERAGE_LABELS: Record<CvTailoringReport["requirements"][number]["covered"], string> = {
  yes: "Covered",
  partly: "Partly covered",
  no: "Not covered",
};

/** Shown one after another while a review runs. Cosmetic: the server doesn't report steps. */
export const PROGRESS_STEPS = ["Reading the posting…", "Comparing with your CV…", "Writing suggestions…"] as const;

/** The progress line for the nth tick; stays on the last step once reached. */
export const progressStep = (tick: number): string =>
  PROGRESS_STEPS[Math.min(Math.max(tick, 0), PROGRESS_STEPS.length - 1)];

/** "Experience · Acme", or just the type when the title is empty or repeats it. */
export const sectionLabel = (section: { section_type: string; title: string } | undefined): string => {
  if (!section) return "Section";
  const type = section.section_type.trim() || "Section";
  const title = section.title.trim();
  if (!title || title.toLowerCase() === type.toLowerCase()) return type;
  return `${type} · ${title}`;
};

export const DONE_LABELS: Record<Exclude<CvSuggestionStatus, "pending">, string> = {
  accepted: "Accepted",
  edited: "Edited",
  rejected: "Dismissed",
  superseded: "Replaced",
};

/** The status saved for an action taken on a suggestion card. */
export const statusForAction = (action: "accept" | "edit" | "reject"): "accepted" | "edited" | "rejected" =>
  action === "accept" ? "accepted" : action === "edit" ? "edited" : "rejected";

/**
 * The panel's groups. Suggestions for sections no longer in the resume are
 * left out. `left` counts every pending one, stale included.
 */
export const reviewGroups = (
  suggestions: CvSuggestion[],
  staleIds: Set<number>,
  sectionIds: Set<number>,
): { open: CvSuggestion[]; stale: CvSuggestion[]; done: CvSuggestion[]; left: number } => {
  const present = suggestions.filter((s) => sectionIds.has(s.curriculum_section_id));
  const groups = splitSuggestions(present, (s) => staleIds.has(s.id));
  return { ...groups, left: groups.open.length + groups.stale.length };
};

/** The `{ error }` message an API call failed with, or the fallback. */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  return typeof message === "string" && message.trim() ? message : fallback;
};

/** The API refused because the suggestion or review changed elsewhere (409). */
export const isConflict = (error: unknown): boolean =>
  (error as { response?: { status?: unknown } } | undefined)?.response?.status === 409;
