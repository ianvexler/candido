"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import getJobBoardEntriesStats from "@/api/resources/jobBoardEntries/getJobBoardEntriesStats";
import { useJobsRefresh } from "@/contexts/JobsRefreshContext";
import { JobBoardEntriesStats, JobBoardEntry, JobStatus } from "@/lib/types";

export type JobCounts = JobBoardEntriesStats["counts"];

const useJobCountsStore = create<{ counts: JobCounts | null; setCounts: (counts: JobCounts) => void }>()((set) => ({
  counts: null,
  setCounts: (counts) => set({ counts }),
}));

/** Counts jobs by stage, the same way the stats endpoint does (archived jobs count only towards the total). */
export const countJobs = (entries: JobBoardEntry[]): JobCounts => {
  const of = (status: JobStatus) => entries.filter((entry) => entry.status === status).length;
  return {
    total: entries.length,
    pending: of(JobStatus.PENDING),
    applied: of(JobStatus.APPLIED),
    assessment: of(JobStatus.ASSESSMENT),
    interview: of(JobStatus.INTERVIEW),
    offered: of(JobStatus.OFFERED),
    accepted: of(JobStatus.ACCEPTED),
    rejected: of(JobStatus.REJECTED),
  };
};

export const activeCount = (counts: Pick<JobCounts, "applied" | "assessment" | "interview">) =>
  counts.applied + counts.assessment + counts.interview;

/**
 * How many jobs sit in each stage, for the sidebar. Loads from the server when
 * you move between pages or import jobs; the board and sheet keep it current
 * while you edit with {@link usePublishJobCounts}.
 */
const useJobCounts = (pathname: string, enabled: boolean) => {
  const { refreshTrigger } = useJobsRefresh();
  const counts = useJobCountsStore((state) => state.counts);
  const setCounts = useJobCountsStore((state) => state.setCounts);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getJobBoardEntriesStats()
      .then((stats) => {
        if (!cancelled) setCounts(stats.counts);
      })
      // The counts are a nicety; the pages report their own load errors.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, refreshTrigger, enabled, setCounts]);

  return counts;
};

/**
 * Keeps the sidebar's counts in step with a page's own list of jobs, so adding,
 * moving or deleting a job shows up straight away. It waits for the list to
 * load first, so the counts don't flash to zero.
 */
export const usePublishJobCounts = (entries: JobBoardEntry[]) => {
  const setCounts = useJobCountsStore((state) => state.setCounts);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (entries.length > 0) loadedRef.current = true;
    if (loadedRef.current) setCounts(countJobs(entries));
  }, [entries, setCounts]);
};

export default useJobCounts;
