import type { ResumeHeader } from "@/lib/types";
import { markPending, markSettled, trackSave } from "./saveTracker";

const SAVE_DELAY_MS = 600;
// Only someone typing on without a pause gets this far.
const MAX_FLUSHES = 20;

/** A profile, or the fields a CV overrides. */
export type HeaderValues = Partial<ResumeHeader>;

interface HeaderDraftOptions<T> {
  value: T;
  save: (values: T) => Promise<unknown>;
  onChange: (values: T) => void;
  onError: (error: unknown) => void;
  delayMs?: number;
}

let instances = 0;

/**
 * Holds a header as edited and saves it after a pause, one request at a time.
 * Edits stay until saved; a failed save is tried again on the next change or flush.
 */
export const createHeaderDraft = <T extends HeaderValues>({
  value,
  save,
  onChange,
  onError,
  delayMs = SAVE_DELAY_MS,
}: HeaderDraftOptions<T>) => {
  const editKey = `header-${++instances}:edit`;
  let current = value;
  let edits = 0;
  let savedEdits = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The pause is over, but the save has to wait for a request.
  let due = false;
  let request: Promise<boolean> | null = null;

  const stopWaiting = () => {
    clearTimeout(timer);
    due = false;
  };

  const run = () => {
    if (request) due = true;
    else void send();
  };

  /** Resolves false if the save failed. */
  const send = (): Promise<boolean> => {
    stopWaiting();
    if (edits === savedEdits) {
      markSettled(editKey);
      return Promise.resolve(true);
    }
    const sent = edits;
    const sending = trackSave(
      "header",
      save(current).then(
        () => {
          savedEdits = sent;
          return true;
        },
        (error) => {
          onError(error);
          return false;
        }
      )
    ).finally(() => {
      request = null;
      if (due) run();
    });
    request = sending;
    markSettled(editKey);
    return sending;
  };

  /** Saves now. Resolves false if it couldn't, or typing didn't stop. */
  const flush = async (): Promise<boolean> => {
    for (let round = 0; round < MAX_FLUSHES; round += 1) {
      if (request) await request;
      else if (edits === savedEdits) {
        stopWaiting();
        markSettled(editKey);
        return true;
      } else if (!(await send())) return false;
    }
    return false;
  };

  return {
    current: () => current,
    flush,

    saveWith: (next: (values: T) => Promise<unknown>) => {
      save = next;
    },

    change: (change: (latest: T) => T) => {
      current = change(current);
      edits += 1;
      stopWaiting();
      markPending(editKey);
      timer = setTimeout(run, delayMs);
      onChange(current);
    },

    /** Starts over with this. What was still unsaved is dropped. */
    load: (next: T) => {
      stopWaiting();
      markSettled(editKey);
      edits += 1;
      current = next;
      if (request) {
        // It would undo what was loaded, so that is sent after it.
        due = true;
        markPending(editKey);
      } else savedEdits = edits;
      onChange(current);
    },

    /** Sends what is still unsaved. */
    dispose: () => void flush(),
  };
};
