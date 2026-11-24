import type { IncludePayload } from "@/api/resources/curriculums/includeFromLibrary";
import { CurriculumSection } from "@/lib/types";
import { trackSave } from "./saveTracker";
import { endsBeforeStart } from "./sectionEntries";

// Only someone typing on without a pause gets this far.
export const MAX_INCLUDES = 20;
export const UNSAVED = "Your latest changes couldn't be saved, so this wasn't added. Try again.";
export const INVALID_DATES = "Fix the end month that is before its start month in this section first. Then add this.";
const KEPT_CHANGING = "This section kept changing, so this wasn't added. Try again.";

/** An include that stopped, with why, to show. */
export class IncludeStopped extends Error {}

interface CvRequestsOptions {
  /** The sections as edited. */
  current: () => CurriculumSection[];
  /** Resolves false if something couldn't be saved. */
  flush: () => Promise<boolean>;
  replace: (section: CurriculumSection) => void;
  reorder: (ids: number[]) => void;
  /** Resolves with the CV's sections. */
  sendInclude: (payload: IncludePayload) => Promise<CurriculumSection[]>;
  sendOrder: (ids: number[]) => Promise<unknown>;
}

const byId = (sections: CurriculumSection[], id: number) => sections.find((section) => section.id === id);

/** The copy that an include changes. */
const copyOf = (sections: CurriculumSection[], templateId: number): CurriculumSection | undefined =>
  sections.filter((section) => section.section_template_id === templateId).sort((a, b) => a.id - b.id)[0];

/** Runs the requests that change which sections a CV has, or their order, one at a time. */
export const createCvRequests = ({
  current,
  flush,
  replace,
  reorder,
  sendInclude,
  sendOrder,
}: CvRequestsOptions) => {
  let last: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const request = trackSave("cv-sections", last.then(task));
    last = request.catch(() => undefined);
    return request;
  };

  const includeNow = async (payload: IncludePayload) => {
    for (let count = 0; count < MAX_INCLUDES; count += 1) {
      if (!(await flush())) throw new IncludeStopped(UNSAVED);
      const before = current();
      // Such a section isn't saved, so the response would undo what was typed.
      if (copyOf(before, payload.section_template_id)?.entries.some(endsBeforeStart)) throw new IncludeStopped(INVALID_DATES);

      const copy = copyOf(await sendInclude(payload), payload.section_template_id);
      if (!copy) return;
      const edited = byId(before, copy.id) !== byId(current(), copy.id);
      // Edited meanwhile: save that and include again, for the same reason.
      if (!edited) return replace(copy);
    }
    throw new IncludeStopped(KEPT_CHANGING);
  };

  const orderNow = () => current().map(({ id }) => id);
  // The order on the server, while moves are being saved.
  let savedOrder: number[] = [];
  let moves = 0;
  let movesSaving = 0;

  const orderSections = async (ids: number[]) => {
    const previous = orderNow();
    if (ids.join() === previous.join()) return;
    if (movesSaving === 0) savedOrder = previous;
    movesSaving += 1;
    moves += 1;
    const move = moves;
    reorder(ids);
    try {
      await enqueue(async () => {
        try {
          const sent = orderNow();
          await sendOrder(sent);
          savedOrder = sent;
        } catch (error) {
          // A later move still shows, and sends this one too.
          if (move === moves) reorder(savedOrder);
          throw error;
        }
      });
    } finally {
      movesSaving -= 1;
    }
  };

  return { enqueue, orderSections, include: (payload: IncludePayload) => enqueue(() => includeNow(payload)) };
};
