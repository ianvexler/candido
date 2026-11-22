import { Dispatch, SetStateAction, useCallback } from "react";
import { applyEntryPatch, EntryPatch } from "./docSlot";
import { JobBoardEntry } from "@/lib/types";

/** Applies a patch to one job in a page's list and, if it's open, in the selected job. */
export const usePatchJob = (
  setEntries: Dispatch<SetStateAction<JobBoardEntry[]>>,
  setSelected: Dispatch<SetStateAction<JobBoardEntry | undefined>>,
) =>
  useCallback(
    (id: number, patch: EntryPatch) => {
      setEntries((prev) => prev.map((entry) => applyEntryPatch(entry, id, patch)));
      setSelected((prev) => prev && applyEntryPatch(prev, id, patch));
    },
    [setEntries, setSelected],
  );
