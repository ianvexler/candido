import { describe, expect, it } from "vitest";
import { JobBoardEntry, JobStatus } from "@/lib/types";
import { activeCount, countJobs } from "./useJobCounts";

const job = (status: JobStatus) => ({ status }) as JobBoardEntry;

describe("countJobs", () => {
  it("counts each stage, with archived jobs only in the total", () => {
    const counts = countJobs([
      job(JobStatus.APPLIED),
      job(JobStatus.APPLIED),
      job(JobStatus.INTERVIEW),
      job(JobStatus.REJECTED),
      job(JobStatus.ARCHIVED),
    ]);

    expect(counts).toEqual({
      total: 5,
      pending: 0,
      applied: 2,
      assessment: 0,
      interview: 1,
      offered: 0,
      accepted: 0,
      rejected: 1,
    });
    expect(activeCount(counts)).toBe(3);
  });
});
