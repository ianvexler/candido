import { Curriculum, JobBoardEntry, JobStatus } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { copyReadiness, jobsToTailor } from "./tailorJobs";

const now = new Date(2026, 10, 23, 12);
const job = (id: number, closing: Date | null, overrides: Partial<JobBoardEntry> = {}) =>
  ({ id, status: JobStatus.PENDING, closing_date: closing ?? undefined, created_at: new Date(2026, 10, id), ...overrides }) as JobBoardEntry;

describe("jobsToTailor", () => {
  it("puts the soonest closing first, then undated newest first, then closed ones", () => {
    const jobs = [
      job(1, null), job(2, new Date(2026, 10, 30)), job(3, new Date(2026, 10, 20)),
      job(4, new Date(2026, 10, 23)), job(5, null),
    ];
    expect(jobsToTailor(jobs, now).map((j) => j.id)).toEqual([4, 2, 5, 1, 3]);
  });

  it("leaves out jobs already applied to", () => {
    expect(jobsToTailor([job(1, null, { status: JobStatus.APPLIED })], now)).toEqual([]);
  });
});

describe("copyReadiness", () => {
  const copy = (tailoring: Partial<NonNullable<Curriculum["tailoring"]>> | null) =>
    ({
      id: 1, title: "CV", updated_at: new Date(),
      tailoring: tailoring && {
        job: { id: 9, title: "Designer", company: "Fernway", status: JobStatus.PENDING },
        source_title: "My CV", fit: "partial", review_status: "succeeded", pending_suggestions: 2, ...tailoring,
      },
    }) as Curriculum;

  it("reads like the job's own readiness", () => {
    expect(copyReadiness(copy({}), true)?.label).toBe("2 suggestions left");
    expect(copyReadiness(copy({ review_status: null, pending_suggestions: 0 }), true)?.label).toBe("CV not tailored");
  });

  it("is null without a job or once applied", () => {
    expect(copyReadiness(copy(null), true)).toBeNull();
    expect(copyReadiness(copy({ job: null }), true)).toBeNull();
    expect(copyReadiness(copy({ job: { id: 9, title: "x", company: "y", status: JobStatus.APPLIED } }), true)).toBeNull();
  });
});
