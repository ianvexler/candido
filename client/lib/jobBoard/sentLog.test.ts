import { describe, expect, it } from "vitest";
import { JobStatus } from "@/lib/types";
import { closingLabel, neighbourId, pageCount, pageOfIndex, pageRangeLabel, sentDocuments, statusCounts } from "./sentLog";

describe("statusCounts", () => {
  it("lists statuses with jobs in pipeline order", () => {
    const entries = [JobStatus.INTERVIEW, JobStatus.APPLIED, JobStatus.APPLIED].map((status) => ({ status }));
    expect(statusCounts(entries)).toEqual([
      { status: JobStatus.APPLIED, count: 2 },
      { status: JobStatus.INTERVIEW, count: 1 },
    ]);
  });
});

describe("sentDocuments", () => {
  it("counts a linked copy, a file or pasted text as sent", () => {
    expect(sentDocuments({ cv_curriculum: null, cv_text: "  ", cover_letter_key: "k" })).toEqual({ cv: false, coverLetter: true });
    expect(sentDocuments({ cv_curriculum: null, cv_text: "Hi", cover_letter_text: "" })).toEqual({ cv: true, coverLetter: false });
  });
});

describe("closingLabel", () => {
  const now = new Date(2026, 2, 10, 15);
  it.each([
    [new Date(2026, 2, 9), "Closed"],
    [new Date(2026, 2, 10), "Closes today"],
    [new Date(2026, 2, 11), "Closes tomorrow"],
    [new Date(2026, 2, 15), "Closes in 5 days"],
  ])("labels %s", (date, label) => expect(closingLabel(date, now)).toBe(label));

  it("is null without a date", () => expect(closingLabel(undefined, now)).toBeNull());
});

describe("neighbourId", () => {
  it("moves to the next listed job below, else above", () => {
    expect(neighbourId([1, 2, 3], 2, [1, 3])).toBe(3);
    expect(neighbourId([1, 2, 3, 4], 2, [1, 4])).toBe(4);
    expect(neighbourId([1, 2, 3], 3, [1, 2])).toBe(2);
  });

  it("falls back to the first job, or null when none are left", () => {
    expect(neighbourId([1, 2], 9, [5, 6])).toBe(5);
    expect(neighbourId([1], 1, [])).toBeNull();
  });
});

describe("paging", () => {
  it("counts pages, with one for an empty list", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it("finds a row's page", () => {
    expect(pageOfIndex(0, 25)).toBe(0);
    expect(pageOfIndex(24, 25)).toBe(0);
    expect(pageOfIndex(25, 25)).toBe(1);
    expect(pageOfIndex(-1, 25)).toBe(0);
  });

  it("labels the rows a page shows", () => {
    expect(pageRangeLabel(0, 64, 25)).toBe("1–25 of 64");
    expect(pageRangeLabel(2, 64, 25)).toBe("51–64 of 64");
    expect(pageRangeLabel(0, 0, 25)).toBe("0 of 0");
  });
});
