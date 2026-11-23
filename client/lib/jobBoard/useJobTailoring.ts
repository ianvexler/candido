import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { rerunCvTailoring } from "@/api/resources/cvTailorings/rerunCvTailoring";
import { pollUntil } from "@/lib/poll";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { isTailoringActive } from "@/lib/resume/suggestions";
import { CvTailoring, JobBoardEntry } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";
import { EntryPatch } from "./docSlot";
import { tailoringPatch } from "./readiness";

/** The latest review of a job's CV, kept up to date while one runs, and a way to start one. */
export const useJobTailoring = (entry: JobBoardEntry, onPatchEntry: (id: number, patch: EntryPatch) => void) => {
  const [loaded, setLoaded] = useState<{ copyId: number; tailoring: CvTailoring | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryId = entry.id;
  const copyId = entry.cv_curriculum?.id;
  // A review loaded for a CV that has since been replaced doesn't count.
  const tailoring = loaded && loaded.copyId === copyId ? loaded.tailoring : null;

  const take = useCallback(
    (id: number, next: CvTailoring | null) => {
      setLoaded({ copyId: id, tailoring: next });
      setError(null);
      onPatchEntry(entryId, tailoringPatch(id, next));
    },
    [entryId, onPatchEntry]
  );

  // Checks while a review runs. The timeout outlasts the longest review.
  const active = isTailoringActive(tailoring);
  useEffect(() => {
    if (copyId === undefined) return;
    const controller = new AbortController();
    pollUntil(
      async () => {
        const { cv_tailoring } = await getLatestCvTailoring(copyId);
        if (!controller.signal.aborted) take(copyId, cv_tailoring);
        return cv_tailoring;
      },
      (latest) => !isTailoringActive(latest),
      { intervalMs: 3000, timeoutMs: 20 * 60_000, signal: controller.signal }
    ).catch((failure) => {
      if (controller.signal.aborted) return;
      console.error(failure);
      setError("Couldn't check on the review. Reload the page to try again.");
    });
    return () => controller.abort();
    // `active` restarts it when a review is started here.
  }, [copyId, active, take]);

  // A job save's response can carry the review as it was a moment earlier: what was loaded here wins.
  const shownStatus = entry.cv_curriculum?.review_status;
  useEffect(() => {
    if (loaded && loaded.copyId === copyId && (loaded.tailoring?.status ?? null) !== shownStatus) {
      onPatchEntry(entryId, tailoringPatch(loaded.copyId, loaded.tailoring));
    }
  }, [loaded, copyId, shownStatus, entryId, onPatchEntry]);

  const start = async () => {
    if (copyId === undefined) return;
    setStarting(true);
    setError(null);
    try {
      take(copyId, (await rerunCvTailoring(copyId)).cv_tailoring);
    } catch (failure) {
      console.error(failure);
      setError(apiErrorMessage(failure, "Couldn't start the review. Try again."));
    } finally {
      setStarting(false);
    }
  };

  return { tailoring, starting, error, start };
};
