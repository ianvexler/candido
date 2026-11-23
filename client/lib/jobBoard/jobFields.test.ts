import { JobBoardEntry, JobStatus } from "@/lib/types";
import { describe, expect, it } from "vitest";
import {
  emptyJobFields, fromDateInput, hasRequiredFields, hasText, isBlankJob, jobFieldsOf, nextNumberIn, sameJobFields, toDateInput,
} from "./jobFields";

const entry = {
  id: 1, title: "Designer", company: "Fernway", location: null, salary: undefined, url: "", status: JobStatus.APPLIED,
  description: "<p>x</p>", job_board_tags: [{ id: 1, name: "Remote" }, { id: 2, name: "UX" }], closing_date: "2026-11-27T00:00:00",
} as unknown as JobBoardEntry;

describe("jobFieldsOf", () => {
  it("fills in what the job doesn't have", () => {
    expect(jobFieldsOf(entry)).toEqual({
      title: "Designer", company: "Fernway", location: "", salary: "", url: "", status: JobStatus.APPLIED,
      description: "<p>x</p>", tags: ["Remote", "UX"], closingDate: "2026-11-27",
    });
  });
});

describe("sameJobFields", () => {
  it("ignores tag order and notices everything else", () => {
    const fields = jobFieldsOf(entry);
    expect(sameJobFields(fields, { ...fields, tags: ["UX", "Remote"] })).toBe(true);
    expect(sameJobFields(fields, { ...fields, tags: ["UX"] })).toBe(false);
    expect(sameJobFields(fields, { ...fields, salary: "£1" })).toBe(false);
    expect(sameJobFields(fields, { ...fields, status: JobStatus.PENDING })).toBe(false);
  });
});

describe("isBlankJob", () => {
  it("is true until anything is entered, tags and dates included", () => {
    expect(isBlankJob({ ...emptyJobFields(), description: "<p></p>", title: " " })).toBe(true);
    expect(isBlankJob({ ...emptyJobFields(), tags: ["Remote"] })).toBe(false);
    expect(isBlankJob({ ...emptyJobFields(), closingDate: "2026-11-27" })).toBe(false);
    expect(isBlankJob({ ...emptyJobFields(), status: JobStatus.APPLIED })).toBe(false);
  });
});

it("hasRequiredFields needs a title and a company", () => {
  expect(hasRequiredFields({ ...emptyJobFields(), title: "x" })).toBe(false);
  expect(hasRequiredFields({ ...emptyJobFields(), title: "x", company: "y" })).toBe(true);
});

it("nextNumberIn goes after the last job of that status", () => {
  const jobs = [{ status: JobStatus.APPLIED, number: 4 }, { status: JobStatus.PENDING, number: 9 }];
  expect(nextNumberIn(jobs, JobStatus.APPLIED)).toBe(5);
  expect(nextNumberIn(jobs, JobStatus.OFFERED)).toBe(1);
});

it("dates survive the trip through the input, and text ignores markup", () => {
  expect(toDateInput(fromDateInput("2026-11-27"))).toBe("2026-11-27");
  expect(fromDateInput("")).toBeNull();
  expect(hasText("<p>&nbsp;</p>")).toBe(false);
  expect(hasText("<p>x</p>")).toBe(true);
});
