import type { UpdateCurriculumPayload } from "@/api/resources/curriculums/updateCurriculum";
import { createSerialQueue } from "@/lib/serialQueue";
import type { PaperSize } from "@/lib/types";
import type { DesignSettings } from "./design";
import { markPending, markSettled, trackSave } from "./saveTracker";

const SAVE_DELAY_MS = 500;

export type CvLook = { design: DesignSettings; paper: PaperSize };
export type LookPayload = Pick<UpdateCurriculumPayload, "styles" | "styles_writer" | "styles_seq">;

interface CvDesignOptions {
  value: CvLook;
  save: (payload: LookPayload) => Promise<unknown>;
  /** For when the page goes away: must outlive it. */
  saveOnLeave: (payload: LookPayload) => void;
  onChange: (look: CvLook) => void;
  onError: (error: unknown, what: "design" | "paper") => void;
  delayMs?: number;
}

let instances = 0;

/**
 * Holds a CV's look as chosen and saves it, the design after a pause. Saves go out
 * one at a time, so the last one sent is the last applied. A design that couldn't
 * be saved goes with the next change or flush; the paper goes back.
 */
export const createCvDesign = ({
  value,
  save,
  saveOnLeave,
  onChange,
  onError,
  delayMs = SAVE_DELAY_MS,
}: CvDesignOptions) => {
  const editKey = `design-${++instances}:edit`;
  const queue = createSerialQueue();
  // Design saves are numbered per page so the server skips one that arrives
  // after a newer one, such as a slow save overtaken by the one sent on leaving.
  const writer = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  let seq = 0;
  let { design, paper } = value;
  let edits = 0;
  let savedEdits = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The design isn't on its way. */
  let waiting = false;
  let savedPaper = paper;
  let paperChanges = 0;
  let last: Promise<boolean> = Promise.resolve(true);

  const show = () => onChange({ design, paper });

  const numbered = (styles: LookPayload["styles"]): LookPayload => {
    seq += 1;
    return { styles, styles_writer: writer, styles_seq: seq };
  };

  const stopWaiting = () => {
    clearTimeout(timer);
    waiting = false;
    markSettled(editKey);
  };

  const sendDesign = () => {
    const sent = edits;
    // Numbered when sent, before it waits in the queue.
    const payload = numbered(design);
    last = trackSave(
      "design",
      queue.run(() => save(payload)).then(
        () => {
          savedEdits = Math.max(savedEdits, sent);
          return true;
        },
        (error) => {
          if (edits === sent) waiting = true;
          onError(error, "design");
          return false;
        }
      )
    );
    stopWaiting();
  };

  return {
    changeDesign: (next: DesignSettings) => {
      design = next;
      edits += 1;
      clearTimeout(timer);
      waiting = true;
      markPending(editKey);
      timer = setTimeout(sendDesign, delayMs);
      show();
    },

    changePaper: (next: PaperSize) => {
      paper = next;
      const change = ++paperChanges;
      show();
      last = trackSave(
        "paper",
        queue.run(() => save({ styles: { paper: next } })).then(
          () => {
            savedPaper = next;
            return true;
          },
          (error) => {
            if (change === paperChanges) {
              paper = savedPaper;
              show();
            }
            onError(error, "paper");
            return false;
          }
        )
      );
    },

    /** Saves now. Resolves false if it couldn't. */
    flush: async (): Promise<boolean> => {
      if (waiting) sendDesign();
      // Newer ones sent meanwhile too.
      for (let awaited: typeof last | null = null; awaited !== last; ) {
        awaited = last;
        await awaited;
      }
      return edits === savedEdits && paper === savedPaper;
    },

    /** The page goes away: what isn't known to be saved goes out once more. */
    leave: () => {
      if (edits === savedEdits && paper === savedPaper) return;
      stopWaiting();
      // Its answer isn't known if the page comes back.
      waiting = edits !== savedEdits;
      // Whole, as the server may then skip what is still on its way.
      saveOnLeave(numbered({ ...design, paper }));
    },

    /** Starts over with this. */
    load: (next: CvLook) => {
      stopWaiting();
      ({ design, paper } = next);
      savedPaper = paper;
      savedEdits = edits;
      show();
    },

    dispose: () => {
      if (waiting) sendDesign();
    },
  };
};
