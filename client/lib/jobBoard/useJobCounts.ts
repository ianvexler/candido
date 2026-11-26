"use client";

import { useEffect, useState } from "react";
import getJobBoardEntriesStats from "@/api/resources/jobBoardEntries/getJobBoardEntriesStats";
import { useJobsRefresh } from "@/contexts/JobsRefreshContext";
import { JobBoardEntriesStats } from "@/lib/types";

export type JobCounts = JobBoardEntriesStats["counts"];

/**
 * How many jobs sit in each stage, for the sidebar. Reloads when jobs are
 * imported and when you move between pages, so a job moved on the board shows
 * up by the time you look elsewhere.
 */
const useJobCounts = (pathname: string, enabled: boolean) => {
  const { refreshTrigger } = useJobsRefresh();
  const [counts, setCounts] = useState<JobCounts | null>(null);

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
  }, [pathname, refreshTrigger, enabled]);

  return counts;
};

export const activeCount = (counts: JobCounts) => counts.applied + counts.assessment + counts.interview;

export default useJobCounts;
