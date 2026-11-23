import { Dispatch, SetStateAction, useCallback } from "react";
import { applyEntryPatch, EntryPatch } from "./docSlot";
import { JobBoardEntry } from "@/lib/types";

/** Applies a patch to one job in a page's list. */
export const usePatchJob = (setEntries: Dispatch<SetStateAction<JobBoardEntry[]>>) =>
  useCallback(
    (id: number, patch: EntryPatch) => setEntries((prev) => prev.map((entry) => applyEntryPatch(entry, id, patch))),
    [setEntries],
  );
