import type { IncludePayload } from "@/api/resources/curriculums/includeFromLibrary";
import type {
  TransferDirection,
  TransferPayload,
  TransferResult,
  TransferValue,
} from "@/api/resources/curriculums/transferWithLibrary";
import { CurriculumSection, SectionTemplate } from "@/lib/types";
import { trackSave } from "./saveTracker";
import type { SectionDraft, SectionPatch } from "./sectionDrafts";
import { endsBeforeStart } from "./sectionEntries";
import { pullInto, sameText, TransferTarget, valueIn } from "./transfer";

// Only someone typing on without a pause gets this far.
export const MAX_INCLUDES = 20;
export const UNSAVED = "Your latest changes couldn't be saved, so this wasn't added. Try again.";
export const INVALID_DATES = "Fix the end month that is before its start month in this section first. Then add this.";
const KEPT_CHANGING = "This section kept changing, so this wasn't added. Try again.";

export const TRANSFER_UNSAVED = "Your latest edit isn't saved, so nothing was changed. Try again.";
export const TRANSFER_INVALID_DATES =
  "Fix the end month that is before its start month in this section first. Then try again.";
export const CHANGED_ELSEWHERE = "This changed elsewhere. Check it and try again.";
export const KEPT_YOURS = "You edited this while it was updating, so your text was kept.";
const TRANSFER_KEPT_CHANGING = "This section kept changing. Check it and try again.";

/** A request that stopped, with why, to show. */
export class RequestStopped extends Error {}

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
  /** A section as the server has it. */
  saved: (id: number) => CurriculumSection | undefined;
  change: (id: number, change: (latest: SectionDraft) => SectionPatch) => void;
  setRecord: (id: number, record: Pick<CurriculumSection, "base_items" | "base_fields" | "section_template_id">) => void;
  /** The library as shown. */
  templates: () => SectionTemplate[];
  /** Shows a library section as the server has it now, if it still does. `id` is what it was known by. */
  takeTemplate: (id: number | null, template: SectionTemplate | null) => void;
  sendTransfer: (sectionId: number, payload: TransferPayload) => Promise<TransferResult>;
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
  saved,
  change,
  setRecord,
  templates,
  takeTemplate,
  sendTransfer,
}: CvRequestsOptions) => {
  let last: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const request = trackSave("cv-sections", last.then(task));
    last = request.catch(() => undefined);
    return request;
  };

  const includeNow = async (payload: IncludePayload) => {
    for (let count = 0; count < MAX_INCLUDES; count += 1) {
      if (!(await flush())) throw new RequestStopped(UNSAVED);
      const before = current();
      // Such a section isn't saved, so the response would undo what was typed.
      if (copyOf(before, payload.section_template_id)?.entries.some(endsBeforeStart)) throw new RequestStopped(INVALID_DATES);

      const copy = copyOf(await sendInclude(payload), payload.section_template_id);
      if (!copy) return;
      const edited = byId(before, copy.id) !== byId(current(), copy.id);
      // Edited meanwhile: save that and include again, for the same reason.
      if (!edited) return replace(copy);
    }
    throw new RequestStopped(KEPT_CHANGING);
  };

  const transferNow = async (
    target: TransferTarget,
    direction: TransferDirection,
    asked: CurriculumSection,
    library: TransferValue
  ) => {
    const { sectionId, entryId, itemId } = target;
    for (let count = 0; count < MAX_INCLUDES; count += 1) {
      if (!(await flush())) throw new RequestStopped(TRANSFER_UNSAVED);
      const before = byId(current(), sectionId);
      const known = saved(sectionId);
      if (!before || !known) return;
      if (before.entries.some(endsBeforeStart)) throw new RequestStopped(TRANSFER_INVALID_DATES);
      if (direction === "to_cv" && !sameText(asked, before, target)) throw new RequestStopped(KEPT_YOURS);
      const cv = valueIn(known, target);
      if (cv === null) return;

      const result = await sendTransfer(sectionId, {
        direction,
        entry_id: entryId,
        item_id: itemId,
        expected_cv: cv,
        expected_library: library,
      });
      const { section, section_template: template, conflict } = result;
      const edited = before !== byId(current(), sectionId);
      // It may be that edit, saved meanwhile, that was in the way.
      if (conflict && edited) continue;

      takeTemplate(known.section_template_id, template);
      if (!edited) {
        replace(section);
      } else {
        // The section sent back may be older than what was saved meanwhile.
        const { base_items, base_fields, section_template_id } = section;
        setRecord(sectionId, { base_items, base_fields, section_template_id });
        let kept = false;
        if (direction === "to_cv") {
          change(sectionId, (latest) => {
            const patch = pullInto(latest, before, section, target);
            kept = !patch.entries;
            return patch;
          });
        }
        if (kept) throw new RequestStopped(KEPT_YOURS);
      }
      if (conflict) throw new RequestStopped(CHANGED_ELSEWHERE);
      return true;
    }
    throw new RequestStopped(TRANSFER_KEPT_CHANGING);
  };

  /** Resolves true if it was done. What the library has is taken as shown now; the CV's text as it is when sent. */
  const transfer = async (target: TransferTarget, direction: TransferDirection): Promise<boolean> => {
    const asked = byId(current(), target.sectionId);
    if (!asked) return false;
    const template = templates().find(({ id }) => id === asked.section_template_id);
    const library = valueIn(template, target, true);
    return (await enqueue(() => transferNow(target, direction, asked, library))) ?? false;
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

  return { enqueue, orderSections, transfer, include: (payload: IncludePayload) => enqueue(() => includeNow(payload)) };
};
