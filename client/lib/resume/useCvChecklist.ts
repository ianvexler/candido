import { addEmptyCurriculumSection } from "@/api/resources/curriculums/addEmptyCurriculumSection";
import { deleteCurriculumSection } from "@/api/resources/curriculums/deleteCurriculumSection";
import { includeFromLibrary } from "@/api/resources/curriculums/includeFromLibrary";
import { reorderCurriculumSections } from "@/api/resources/curriculums/reorderCurriculumSections";
import { CurriculumSection } from "@/lib/types";
import { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { moveSection, tickEntry, tickItem, tickSection } from "./checklist";
import { sectionColumn } from "./exportDocument";
import { apiErrorMessage } from "./reviewPanel";
import { trackSave } from "./saveTracker";
import { moveEntry } from "./sectionEntries";
import type { useSectionDrafts } from "./useSectionDrafts";

/** A section, or an entry or item of it. */
export type ChecklistTarget = {
  /** Null for library content that the CV has no copy of. */
  sectionId: number | null;
  templateId: number | null;
  entryId?: string;
  itemId?: string;
  inCv: boolean;
};

export const targetKey = ({ sectionId, templateId, entryId = "", itemId = "" }: ChecklistTarget) =>
  [templateId === null ? `cv-${sectionId}` : templateId, entryId, itemId].join(":");

export type ChecklistActions = {
  tick: (target: ChecklistTarget, on: boolean) => void;
  moveSection: (id: number, by: -1 | 1) => void;
  orderSections: (ids: number[]) => void;
  moveEntry: (sectionId: number, entryId: string, by: -1 | 1) => void;
  orderEntries: (sectionId: number, entryIds: string[]) => void;
  toggleColumn: (id: number) => void;
  removeSection: (id: number) => Promise<void>;
};

type Drafts = Pick<
  ReturnType<typeof useSectionDrafts<CurriculumSection>>,
  "current" | "change" | "flush" | "replace" | "add" | "reorder" | "remove"
>;

// Only someone typing on without a pause gets this far.
const MAX_INCLUDES = 20;
const NOTHING_PENDING: ReadonlySet<string> = new Set();

const sectionWith = (sections: CurriculumSection[], id: number) => sections.find((section) => section.id === id);

/** What the checklist does to a CV. The functions stay the same. `refreshLibrary` is for when it turns out to have changed. */
export const useCvChecklist = (
  curriculumId: number,
  { current, change, flush, replace, add, reorder, remove }: Drafts,
  refreshLibrary: () => Promise<void>
) => {
  const [pending, setPending] = useState(NOTHING_PENDING);

  // Requests that change the CV's set or order of sections run one at a time.
  const last = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const request = trackSave("cv-sections", last.current.then(task));
    last.current = request.catch(() => undefined);
    return request;
  }, []);

  const pendingKeys = useRef(new Set<string>());
  const setBusy = useCallback((key: string, busy: boolean) => {
    if (busy) pendingKeys.current.add(key);
    else pendingKeys.current.delete(key);
    setPending(new Set(pendingKeys.current));
  }, []);

  const include = useCallback(
    async (templateId: number, entryId?: string, itemId?: string) => {
      for (let count = 1; ; count += 1) {
        if (!(await flush())) {
          toast.error("Your latest changes couldn't be saved, so this wasn't added. Try again.");
          return;
        }
        const before = current();
        const { curriculum } = await includeFromLibrary(curriculumId, {
          section_template_id: templateId,
          entry_id: entryId,
          item_id: itemId,
        });
        const [copy] = (curriculum.sections ?? [])
          .filter((section) => section.section_template_id === templateId)
          .sort((a, b) => a.id - b.id);
        if (!copy) return;
        // Edited meanwhile: save that and include again, or the response would undo the edit.
        const edited = sectionWith(before, copy.id) !== sectionWith(current(), copy.id);
        if (!edited) {
          replace(copy);
          return;
        }
        if (count === MAX_INCLUDES) throw new Error("The section kept changing");
      }
    },
    [curriculumId, current, flush, replace]
  );

  const tick = useCallback(
    (target: ChecklistTarget, on: boolean) => {
      const { sectionId, templateId, entryId, itemId, inCv } = target;
      if (inCv && sectionId !== null) {
        change(sectionId, (section) => {
          if (entryId === undefined) return tickSection(section, on);
          if (itemId === undefined) return tickEntry(section, entryId, on);
          return tickItem(section, entryId, itemId, on);
        });
        return;
      }
      const key = targetKey(target);
      if (!on || templateId === null || pendingKeys.current.has(key)) return;

      setBusy(key, true);
      void enqueue(() => include(templateId, entryId, itemId))
        .catch((error) => {
          console.error(error);
          toast.error(apiErrorMessage(error, "Couldn't add this from your library. Try again."));
          void refreshLibrary();
        })
        .finally(() => setBusy(key, false));
    },
    [change, enqueue, include, refreshLibrary, setBusy]
  );

  const orderSections = useCallback(
    (ids: number[]) => {
      const previous = current().map(({ id }) => id);
      if (ids.join() === previous.join()) return;
      reorder(ids);
      void enqueue(() => reorderCurriculumSections(curriculumId, current().map(({ id }) => id))).catch((error) => {
        console.error(error);
        toast.error("Failed to save the new order");
        reorder(previous);
      });
    },
    [curriculumId, current, enqueue, reorder]
  );

  const addSection = useCallback(
    (sectionType: string) =>
      enqueue(async () => {
        const response = await addEmptyCurriculumSection(curriculumId, sectionType);
        // The endpoint appends, so the last one is the new section.
        const section = (response.curriculum.sections ?? []).at(-1);
        if (section) add([section]);
        return section;
      }),
    [curriculumId, add, enqueue]
  );

  const removeSection = useCallback(
    async (id: number) => {
      try {
        await enqueue(() => remove(id, deleteCurriculumSection(curriculumId, id)));
      } catch (error) {
        console.error(error);
        toast.error("Failed to remove section");
      }
    },
    [curriculumId, enqueue, remove]
  );

  const actions: ChecklistActions = useMemo(
    () => ({
      tick,
      orderSections,
      removeSection,
      moveSection: (id, by) => orderSections(moveSection(current().map((section) => section.id), id, by)),
      moveEntry: (sectionId, entryId, by) =>
        change(sectionId, ({ entries }) => ({ entries: moveEntry(entries, entryId, by) })),
      orderEntries: (sectionId, entryIds) =>
        change(sectionId, ({ entries }) => ({
          entries: [...entries].sort((a, b) => entryIds.indexOf(a.id) - entryIds.indexOf(b.id)),
        })),
      // Stores the choice explicitly, so it wins over the guess from the section type.
      toggleColumn: (id) =>
        change(id, (section) => ({ placement: sectionColumn(section) === "sidebar" ? "main" : "sidebar" })),
    }),
    [tick, orderSections, removeSection, current, change]
  );

  return { pending, actions, addSection };
};
