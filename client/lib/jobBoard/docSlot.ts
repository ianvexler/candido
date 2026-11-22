import { uploadCoverLetterJobBoardEntry } from "@/api/resources/jobBoardEntries/uploadCoverLetterJobBoardEntry";
import { uploadCVJobBoardEntry } from "@/api/resources/jobBoardEntries/uploadCVJobBoardEntry";
import { Curriculum, JobBoardEntry } from "@/lib/types";

export type DocSlotState = "empty" | "file" | "text" | "copy";

/**
 * A change to one job: fields to set, or a function of the job as it is when the change
 * lands. Every save sends only the fields it owns, so a response that arrives late, or
 * after the user moved to another job, can't overwrite anything else.
 */
export type EntryPatch = Partial<JobBoardEntry> | ((current: JobBoardEntry) => Partial<JobBoardEntry>);

/** Applies a patch to the job it was made for; any other job is returned unchanged. */
export const applyEntryPatch = (entry: JobBoardEntry, id: number, patch: EntryPatch): JobBoardEntry =>
  entry.id === id ? { ...entry, ...(typeof patch === "function" ? patch(entry) : patch) } : entry;

// Counts document saves (uploads, pastes, removals, copies linked), and which count each job's
// last one had, so a job save can tell whether a document changed while it was out.
let documentSaves = 0;
const lastDocumentSave = new Map<number, number>();

/** Records that a job's documents changed; call it when the save's response arrives. */
export const noteDocumentsSaved = (id: number) => {
  documentSaves += 1;
  lastDocumentSave.set(id, documentSaves);
};

/** Marks when a job save is sent; pass the result to jobSavePatch. */
export const jobSaveStarted = (): number => documentSaves;

/** What fills the job's one CV slot: a linked copy, an uploaded file, pasted text, or nothing. */
export const cvSlotState = (
  entry: Pick<JobBoardEntry, "cv_curriculum" | "cv_key" | "cv_text">,
): DocSlotState => {
  if (entry.cv_curriculum) return "copy";
  if (entry.cv_key) return "file";
  if (entry.cv_text?.trim()) return "text";
  return "empty";
};

/** What fills the job's cover letter: an uploaded file, pasted text, or nothing. */
export const coverLetterSlotState = (
  entry: Pick<JobBoardEntry, "cover_letter_key" | "cover_letter_text">,
): Exclude<DocSlotState, "copy"> => {
  if (entry.cover_letter_key) return "file";
  if (entry.cover_letter_text?.trim()) return "text";
  return "empty";
};

/** Links a new copy; the server clears any upload or text. */
export const copyPatch = (copy: Pick<Curriculum, "id" | "title" | "updated_at">): Partial<JobBoardEntry> => ({
  cv_curriculum: { id: copy.id, title: copy.title, updated_at: String(copy.updated_at), fit: null },
  cv_text: undefined,
  cv_key: undefined,
  cv_filename: undefined,
});

/**
 * After a copy was made: link it on the job first, then go to it through the leave check.
 * The copy is already linked, so staying to keep unsaved job edits loses nothing.
 */
export const afterCopyCreated = ({
  entryId,
  copy,
  onPatchEntry,
  beforeLeave,
  navigate,
}: {
  entryId: number;
  copy: Pick<Curriculum, "id" | "title" | "updated_at">;
  onPatchEntry: (id: number, patch: EntryPatch) => void;
  beforeLeave: (action: () => void) => void;
  navigate: (href: string) => void;
}) => {
  noteDocumentsSaved(entryId);
  onPatchEntry(entryId, copyPatch(copy));
  beforeLeave(() => navigate(`/resume/${copy.id}`));
};

/** A review couldn't run (503 no key, 429 daily limit), so nothing was created. */
export const isReviewUnavailable = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | undefined)?.response?.status;
  return status === 503 || status === 429;
};

export type DocKind = "cv" | "cover_letter";
export type FillWay = "upload" | "paste" | "use";

export interface DocKindConfig {
  /** Sentence start, e.g. in toasts. */
  name: string;
  /** Mid-sentence. */
  noun: string;
  /** Ways to fill an empty slot, in button order. */
  ways: FillWay[];
  placeholder: string;
  fallbackFilename: string;
  state: (entry: JobBoardEntry) => DocSlotState;
  doc: (entry: JobBoardEntry) => { key?: string; text?: string; filename?: string };
  /** Saves the document; with no text or file it clears it. */
  upload: (id: number, text?: string, file?: File) => Promise<{ job_board_entry: JobBoardEntry }>;
  /** The fields an upload response sets: this document's, and nothing else. */
  patch: (saved: JobBoardEntry) => Partial<JobBoardEntry>;
}

/** What differs between the job's two documents; the slot itself is shared. */
export const DOC_KINDS: Record<DocKind, DocKindConfig> = {
  cv: {
    name: "CV",
    noun: "CV",
    ways: ["upload", "paste", "use"],
    placeholder: "Paste the CV you sent",
    fallbackFilename: "cv.pdf",
    state: cvSlotState,
    doc: (e) => ({ key: e.cv_key, text: e.cv_text, filename: e.cv_filename }),
    upload: uploadCVJobBoardEntry,
    // Uploading or pasting unlinks any copy.
    patch: (saved) => ({ cv_curriculum: null, cv_text: saved.cv_text, cv_key: saved.cv_key, cv_filename: saved.cv_filename }),
  },
  cover_letter: {
    name: "Cover letter",
    noun: "cover letter",
    ways: ["upload", "paste"],
    placeholder: "Paste the cover letter you sent",
    fallbackFilename: "cover-letter.pdf",
    state: coverLetterSlotState,
    doc: (e) => ({ key: e.cover_letter_key, text: e.cover_letter_text, filename: e.cover_letter_filename }),
    upload: uploadCoverLetterJobBoardEntry,
    patch: (saved) => ({
      cover_letter_text: saved.cover_letter_text,
      cover_letter_key: saved.cover_letter_key,
      cover_letter_filename: saved.cover_letter_filename,
    }),
  },
};

/** Saves one of a job's documents and returns the patch for it, noting the save for job saves. */
export const saveDocument = async (kind: DocKind, id: number, text?: string, file?: File): Promise<EntryPatch> => {
  const { job_board_entry } = await DOC_KINDS[kind].upload(id, text, file);
  noteDocumentsSaved(id);
  return DOC_KINDS[kind].patch(job_board_entry);
};

/** Ways to replace what's in the slot: pasted text is edited in place, so pasting isn't offered again. */
export const replaceWays = (kind: DocKind, state: DocSlotState): FillWay[] =>
  state === "text" ? DOC_KINDS[kind].ways.filter((way) => way !== "paste") : DOC_KINDS[kind].ways;

/** Pasted text for a two-line preview, with blank lines dropped so they don't use up the lines. */
export const textPreview = (text: string | undefined): string =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

const DOCUMENT_FIELDS = [
  "cv_curriculum",
  "cv_text",
  "cv_key",
  "cv_filename",
  "cover_letter_text",
  "cover_letter_key",
  "cover_letter_filename",
] as const;

/**
 * What a job save sets. Its response has the documents as they were when the server read the
 * job. If a document was saved after the job save was sent, the response may predate it, so the
 * documents stay as they are; the linked copy's details (title, fit, edit time) are still taken
 * when the response names the same copy. Otherwise the response is current and is taken whole,
 * so a copy unlinked elsewhere (deleted in another tab) is cleared.
 */
export const jobSavePatch = (saved: JobBoardEntry, startedAt: number): EntryPatch => (current) => {
  if ((lastDocumentSave.get(saved.id) ?? 0) <= startedAt) return { ...saved };
  const patch: Partial<JobBoardEntry> = { ...saved };
  for (const field of DOCUMENT_FIELDS) delete patch[field];
  if (saved.cv_curriculum && current.cv_curriculum?.id === saved.cv_curriculum.id) {
    patch.cv_curriculum = saved.cv_curriculum;
  }
  return patch;
};
