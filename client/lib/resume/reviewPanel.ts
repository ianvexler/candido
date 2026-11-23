import type { CvSuggestion, CvSuggestionStatus, CvTailoringReport, MissingSection } from "@/lib/types";
import { splitSuggestions } from "./suggestions";

export const FIT_LABELS: Record<CvTailoringReport["fit"], string> = {
  strong: "Strong",
  partial: "Partial",
  weak: "Weak",
};

/** Badge colours for a fit; the `<i>` child is the dot. */
export const FIT_STYLES: Record<CvTailoringReport["fit"], string> = {
  strong: "bg-emerald-50 text-emerald-900 [&>i]:bg-emerald-500",
  partial: "bg-amber-50 text-amber-900 [&>i]:bg-amber-500",
  weak: "bg-rose-50 text-rose-900 [&>i]:bg-rose-500",
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

/**
 * The headings that count as having each section. Mirrors the server's
 * CvTailorings::Normalizer::MISSING_SECTIONS; keep the two in step.
 */
export const MISSING_SECTION_PATTERNS: Record<MissingSection, RegExp> = {
  Experience: /\b(?:experience|employment|work|career|jobs?|internships?|positions?)\b/i,
  Education: /\b(?:education|qualifications?|academics?|degrees?|stud(?:y|ies)|school|university|training|certificat(?:es?|ions?))\b/i,
  Skills: /\b(?:skills?|competenc(?:y|ies|es?)|technolog(?:y|ies)|tools?|stack|expertise)\b/i,
};

/** The report's missing sections the CV still has none of, so one disappears once it's added. */
export const stillMissing = (
  report: Pick<CvTailoringReport, "missing_sections"> | null,
  sections: { section_type: string; title: string }[],
): NonNullable<CvTailoringReport["missing_sections"]> =>
  (report?.missing_sections ?? []).filter(
    ({ section }) =>
      // A title only counts on a custom section: elsewhere it's often an employer.
      !sections.some((s) =>
        MISSING_SECTION_PATTERNS[section].test(s.section_type.toLowerCase() === "custom" ? s.title : s.section_type)
      ),
  );
