import { addEmptyCurriculumSection } from "@/api/resources/curriculums/addEmptyCurriculumSection";
import { deleteCurriculumSection } from "@/api/resources/curriculums/deleteCurriculumSection";
import { includeFromLibrary } from "@/api/resources/curriculums/includeFromLibrary";
import { reorderCurriculumSections } from "@/api/resources/curriculums/reorderCurriculumSections";
import { setCurriculumPurpose } from "@/api/resources/curriculums/setCurriculumPurpose";
import { TransferDirection, transferWithLibrary } from "@/api/resources/curriculums/transferWithLibrary";
import { CurriculumSection } from "@/lib/types";
import { useCallback, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Fits, moveSection, placeSection, tickEntry, tickItem, tickSection } from "./checklist";
import { createCvRequests, RequestStopped, TextKept } from "./cvRequests";
import { sectionColumn } from "./exportDocument";
import { itemFits } from "./purposes";
import { apiErrorMessage } from "./reviewPanel";
import { moveEntry } from "./sectionEntries";
import type { TransferTarget } from "./transfer";
import type { useSectionDrafts } from "./useSectionDrafts";
import type { useSectionLibrary } from "./useSectionLibrary";

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

/** Apart from any targetKey of what is being included. */
export const transferKey = ({ sectionId, entryId, itemId = "" }: TransferTarget) =>
  ["transfer", sectionId, entryId, itemId].join(":");

export type ChecklistActions = {
  /** Gives the id of the CV's section it is in, once it is; null if it isn't, or another tick is already under way. */
  tick: (target: ChecklistTarget, on: boolean) => Promise<number | null>;
  moveSection: (id: number, by: -1 | 1) => void;
  orderSections: (ids: number[]) => void;
  /** After another, or first for null. */
  placeSection: (id: number, afterId: number | null) => void;
  moveEntry: (sectionId: number, entryId: string, by: -1 | 1) => void;
  orderEntries: (sectionId: number, entryIds: string[]) => void;
  toggleColumn: (id: number) => void;
  removeSection: (id: number) => Promise<void>;
  /** Passes text between the CV and the library. Never rejects. */
  transfer: (target: TransferTarget, direction: TransferDirection) => Promise<void>;
};

type Drafts = Pick<
  ReturnType<typeof useSectionDrafts<CurriculumSection>>,
  "current" | "saved" | "isSaved" | "change" | "setRecord" | "flush" | "replace" | "add" | "reorder" | "remove"
>;

const NOTHING_PENDING: ReadonlySet<string> = new Set();
type Library = Pick<ReturnType<typeof useSectionLibrary>, "current" | "take" | "refresh">;

/**
 * What the checklist does to a CV. The functions stay the same, apart from
 * `tick`, which changes with `purposeId` (null: Everything).
 */
export const useCvChecklist = (
  curriculumId: number,
  { current, saved, isSaved, change, setRecord, flush, replace, add, reorder, remove }: Drafts,
  { current: templates, take: takeTemplate, refresh: refreshLibrary }: Library,
  purposeId: number | null = null
) => {
  const [pending, setPending] = useState(NOTHING_PENDING);
  const [changingPurpose, setChangingPurpose] = useState(false);

  // As with the drafts: these go by the CV first given, and a page has only one.
  const [requests] = useState(() =>
    createCvRequests({
      current,
      flush,
      replace,
      reorder,
      sendInclude: async (payload) => (await includeFromLibrary(curriculumId, payload)).curriculum.sections ?? [],
      sendOrder: (ids) => reorderCurriculumSections(curriculumId, ids),
      saved,
      isSaved,
      change,
      setRecord,
      templates,
      takeTemplate,
      sendTransfer: (sectionId, payload) => transferWithLibrary(curriculumId, sectionId, payload),
      sendPurpose: async (labelId, force) => (await setCurriculumPurpose(curriculumId, labelId, force)).curriculum,
      onChangingPurpose: setChangingPurpose,
    })
  );
  const { enqueue, include, transfer: sendTransfer, orderSections: saveOrder, changePurpose } = requests;
  const ticksLocked = requests.changingPurpose;

  const pendingKeys = useRef(new Set<string>());
  const setBusy = useCallback((key: string, busy: boolean) => {
    if (busy) pendingKeys.current.add(key);
    else pendingKeys.current.delete(key);
    setPending(new Set(pendingKeys.current));
  }, []);

  const tick = useCallback(
    (target: ChecklistTarget, on: boolean) => {
      const { sectionId, templateId, entryId, itemId, inCv } = target;
      // The rows show they can't be ticked; see changingPurpose.
      if (ticksLocked()) {
        toast("Wait until the collection has changed, then try again.");
        return Promise.resolve(null);
      }
      if (inCv && sectionId !== null) {
        // What fits the purpose, as the library labels it. Everything and CV-only sections tick all.
        const template = templateId === null ? undefined : templates().find(({ id }) => id === templateId);
        const fits: Fits | undefined =
          template && purposeId !== null ? (entry, item) => itemFits(template, entry, item, purposeId) : undefined;
        change(sectionId, (section) => {
          if (entryId === undefined) return tickSection(section, on, fits);
          if (itemId === undefined) return tickEntry(section, entryId, on, fits);
          return tickItem(section, entryId, itemId, on);
        });
        return Promise.resolve(sectionId);
      }
      const key = targetKey(target);
      if (!on || templateId === null || pendingKeys.current.has(key)) return Promise.resolve(null);

      setBusy(key, true);
      return include({ section_template_id: templateId, entry_id: entryId, item_id: itemId })
        .catch((error) => {
          if (error instanceof RequestStopped) {
            toast.error(error.message);
            return null;
          }
          console.error(error);
          toast.error(apiErrorMessage(error, "Couldn't add this from your library. Try again."));
          void refreshLibrary();
          return null;
        })
        .finally(() => setBusy(key, false));
    },
    [change, include, refreshLibrary, setBusy, templates, purposeId, ticksLocked]
  );

  const transfer = useCallback(
    async (target: TransferTarget, direction: TransferDirection) => {
      const key = transferKey(target);
      if (pendingKeys.current.has(key)) return;

      setBusy(key, true);
      try {
        const done = await sendTransfer(target, direction);
        if (done && direction === "to_library") toast.success("Library updated");
      } catch (error) {
        if (error instanceof RequestStopped) {
          if (error instanceof TextKept) toast(error.message);
          else toast.error(error.message);
        } else {
          console.error(error);
          toast.error(apiErrorMessage(error, "Couldn't do this. Check your connection and try again."));
          void refreshLibrary();
        }
      } finally {
        setBusy(key, false);
      }
    },
    [refreshLibrary, sendTransfer, setBusy]
  );

  const orderSections = useCallback(
    (ids: number[]) =>
      void saveOrder(ids).catch((error) => {
        console.error(error);
        toast.error("Failed to save the new order");
      }),
    [saveOrder]
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
      transfer,
      moveSection: (id, by) => orderSections(moveSection(current().map((section) => section.id), id, by)),
      placeSection: (id, afterId) => {
        const ids = placeSection(current().map((section) => section.id), id, afterId);
        if (ids) orderSections(ids);
      },
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
    [tick, orderSections, removeSection, transfer, current, change]
  );

  /** While true, nothing may be ticked or left out: see createCvRequests' changingPurpose. */
  return { pending, actions, addSection, changePurpose, changingPurpose };
};
