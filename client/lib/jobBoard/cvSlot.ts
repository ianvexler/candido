import { Curriculum, JobBoardEntry } from "@/lib/types";

export type CvSlotState = "empty" | "file" | "text" | "copy";

/** What fills the job's one CV slot: a linked copy, an uploaded file, pasted text, or nothing. */
export const cvSlotState = (
  entry: Pick<JobBoardEntry, "cv_curriculum" | "cv_key" | "cv_text">,
): CvSlotState => {
  if (entry.cv_curriculum) return "copy";
  if (entry.cv_key) return "file";
  if (entry.cv_text?.trim()) return "text";
  return "empty";
};

/** The entry after a copy was made and linked; the server clears any upload or text. */
export const entryWithCopy = (
  entry: JobBoardEntry,
  copy: Pick<Curriculum, "id" | "title" | "updated_at">,
): JobBoardEntry => ({
  ...entry,
  cv_curriculum: { id: copy.id, title: copy.title, updated_at: String(copy.updated_at), fit: null },
  cv_text: undefined,
  cv_key: undefined,
  cv_filename: undefined,
});

/** The entry after the upload endpoint answered; any linked copy is unlinked. */
export const entryWithUpload = (
  entry: JobBoardEntry,
  updated: Pick<JobBoardEntry, "cv_text" | "cv_key" | "cv_filename">,
): JobBoardEntry => ({
  ...entry,
  cv_curriculum: null,
  cv_text: updated.cv_text,
  cv_key: updated.cv_key,
  cv_filename: updated.cv_filename,
});

/** A review couldn't run (503 no key, 429 daily limit), so nothing was created. */
export const isReviewUnavailable = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | undefined)?.response?.status;
  return status === 503 || status === 429;
};
