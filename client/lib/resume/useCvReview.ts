import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { rerunCvTailoring } from "@/api/resources/cvTailorings/rerunCvTailoring";
import { updateCvSuggestion } from "@/api/resources/cvTailorings/updateCvSuggestion";
import { getJobBoardEntry } from "@/api/resources/jobBoardEntries/getJobBoardEntry";
import type { SuggestionAction } from "@/components/resume/review/SuggestionCard";
import { pollUntil, PollTimeoutError } from "@/lib/poll";
import { CurriculumSection, CvSuggestion, CvTailoring } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { suggestionPlace } from "./checklist";
import { apiErrorMessage, isConflict, statusForAction } from "./reviewPanel";
import { waitForSaves } from "./saveTracker";
import { isTailoringActive } from "./suggestions";

/** A tailored copy's latest review, and where its suggestions' text is now. */
export const useCvReview = (curriculumId: number, sections: CurriculumSection[], flush: () => Promise<boolean>) => {
  const [tailoring, setTailoring] = useState<CvTailoring | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobHasUrl, setJobHasUrl] = useState(false);

  // Polls while a review runs; stops on unmount. The server always ends a run
  // (it expires one that stops working), so the timeout only needs to outlast
  // the longest review: 8 minutes before the last request starts, plus that
  // request and its retry.
  const active = isTailoringActive(tailoring);
  const tailoringId = tailoring?.id;
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    pollUntil(() => getLatestCvTailoring(curriculumId), (r) => !isTailoringActive(r.cv_tailoring), {
      intervalMs: 3000,
      timeoutMs: 20 * 60_000,
      signal: controller.signal,
    })
      .then((r) => setTailoring(r.cv_tailoring))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        console.error(failure);
        setError(
          failure instanceof PollTimeoutError
            ? "This is taking longer than usual. Reload the page to check again."
            : "Couldn't check on the review. Reload the page to try again."
        );
      });

    return () => controller.abort();
  }, [curriculumId, active, tailoringId]);

  // Only worth saying the posting wasn't read when the job has a URL.
  const postingJobId = tailoring && !tailoring.used_posting ? tailoring.job_board_entry_id : null;
  useEffect(() => {
    if (postingJobId === null) return;
    let cancelled = false;
    void getJobBoardEntry(String(postingJobId))
      .then((response) => {
        if (!cancelled) setJobHasUrl(Boolean(response.job_board_entry.url?.trim()));
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [postingJobId]);

  const suggestionsBySection = useMemo(() => {
    const map = new Map<number, CvSuggestion[]>();
    if (tailoring?.status !== "succeeded") return map;
    for (const s of tailoring.suggestions) {
      map.set(s.curriculum_section_id, [...(map.get(s.curriculum_section_id) ?? []), s]);
    }
    return map;
  }, [tailoring]);

  const { staleIds, leftOutIds } = useMemo(() => {
    const found = { staleIds: new Set<number>(), leftOutIds: new Set<number>() };
    sections.forEach((section) =>
      suggestionsBySection.get(section.id)?.forEach((s) => {
        if (s.status !== "pending") return;
        const place = suggestionPlace(section, s);
        if (place === "stale") found.staleIds.add(s.id);
        if (place === "left_out") found.leftOutIds.add(s.id);
      })
    );
    return found;
  }, [sections, suggestionsBySection]);

  const replaceSuggestion = useCallback(
    (next: CvSuggestion) =>
      setTailoring((current) =>
        current && {
          ...current,
          suggestions: current.suggestions.map((s) => (s.id === next.id ? next : s)),
        }
      ),
    []
  );

  // The suggestion or review changed elsewhere (e.g. a re-run in another
  // tab): show the latest review instead of the one on screen.
  const refresh = useCallback(async () => {
    try {
      setActiveId(null);
      setTailoring((await getLatestCvTailoring(curriculumId)).cv_tailoring);
    } catch (failure) {
      console.error(failure);
    }
  }, [curriculumId]);

  // Records the decision; the entry's editor changes the text once this resolves
  // and toasts a failure itself, so errors are rethrown, not shown here.
  const resolve = useCallback(
    async (s: CvSuggestion, action: SuggestionAction, text?: string) => {
      const status = statusForAction(action);
      try {
        const { suggestion } = await updateCvSuggestion(
          s.id,
          status === "edited" ? { status, replacement: text ?? "" } : { status }
        );
        replaceSuggestion(suggestion);
      } catch (failure) {
        if (isConflict(failure)) void refresh();
        throw failure;
      }
    },
    [replaceSuggestion, refresh]
  );

  const close = useCallback(() => setActiveId(null), []);

  const dismiss = async (s: CvSuggestion) => {
    try {
      const { suggestion } = await updateCvSuggestion(s.id, { status: "rejected" });
      replaceSuggestion(suggestion);
      if (activeId === s.id) setActiveId(null);
    } catch (failure) {
      console.error(failure);
      toast.error(apiErrorMessage(failure, "Couldn't save that change"));
      if (isConflict(failure)) void refresh();
    }
  };

  const rerun = async () => {
    setRerunning(true);
    setError(null);
    try {
      // Let pending autosaves land first, so the review reads the latest text.
      if (!(await flush())) {
        setError("Your latest changes couldn't be saved, so the review wasn't started. Try again.");
        return;
      }
      await waitForSaves();
      const response = await rerunCvTailoring(curriculumId);
      setActiveId(null);
      setTailoring(response.cv_tailoring);
    } catch (failure) {
      console.error(failure);
      setError(apiErrorMessage(failure, "Couldn't start the review. Try again."));
    } finally {
      setRerunning(false);
    }
  };

  return {
    tailoring,
    setTailoring,
    activeId,
    setActiveId,
    suggestionsBySection,
    staleIds,
    leftOutIds,
    rerunning,
    error,
    jobHasUrl,
    resolve,
    close,
    dismiss,
    rerun,
  };
};
