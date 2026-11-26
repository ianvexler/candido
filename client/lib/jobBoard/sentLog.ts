import { JobBoardEntry, JobStatus } from "@/lib/types";
import { coverLetterSlotState, cvSlotState } from "./docSlot";
import { differenceInCalendarDays } from "date-fns";

/** Statuses in pipeline order, for the filter chips. */
export const STATUS_ORDER: JobStatus[] = [
  JobStatus.PENDING,
  JobStatus.APPLIED,
  JobStatus.ASSESSMENT,
  JobStatus.INTERVIEW,
  JobStatus.OFFERED,
  JobStatus.ACCEPTED,
  JobStatus.REJECTED,
  JobStatus.ARCHIVED,
];

/** Each status that has jobs, in pipeline order, with how many. */
export const statusCounts = (entries: Pick<JobBoardEntry, "status">[]): { status: JobStatus; count: number }[] =>
  STATUS_ORDER.map((status) => ({ status, count: entries.filter((e) => e.status === status).length })).filter(
    (s) => s.count > 0
  );

/** Whether a CV and a cover letter are on the job, whatever form they're in. */
export const sentDocuments = (
  entry: Pick<JobBoardEntry, "cv_curriculum" | "cv_key" | "cv_text" | "cover_letter_key" | "cover_letter_text">
) => ({
  cv: cvSlotState(entry) !== "empty",
  coverLetter: coverLetterSlotState(entry) !== "empty",
});

/** "Closed", "Closes today", "Closes tomorrow", "Closes in 5 days"; null without a date. */
export const closingLabel = (closing: Date | string | undefined | null, now = new Date()): string | null => {
  if (!closing) return null;
  const days = differenceInCalendarDays(new Date(closing), now);
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  return `Closes in ${days} days`;
};

/** The job description's text, one paragraph per line, without the editor's markup. */
export const descriptionText = (html: string | undefined | null): string => {
  if (!html?.trim()) return "";
  // Only rendered in the browser; strip tags crudely if it ever runs elsewhere.
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = doc.body.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, blockquote, pre");
  const lines = blocks.length
    ? Array.from(blocks)
        // Nested blocks (a paragraph inside a list item) would be read twice.
        .filter((block) => !block.parentElement?.closest("li, blockquote"))
        .map((block) => (block.tagName === "LI" ? `• ${block.textContent ?? ""}` : (block.textContent ?? "")))
    : [doc.body.textContent ?? ""];
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
};

/**
 * Where the selection goes when the selected job leaves the list: the next job that was below
 * it and is still listed, else the one above, else the first; null when the list is empty.
 */
export const neighbourId = (previousIds: number[], goneId: number, currentIds: number[]): number | null => {
  const listed = new Set(currentIds);
  const index = previousIds.indexOf(goneId);
  if (index !== -1) {
    const below = previousIds.slice(index + 1).find((id) => listed.has(id));
    if (below !== undefined) return below;
    const above = previousIds.slice(0, index).reverse().find((id) => listed.has(id));
    if (above !== undefined) return above;
  }
  return currentIds[0] ?? null;
};
