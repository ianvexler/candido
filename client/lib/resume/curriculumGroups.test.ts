import { describe, expect, it } from "vitest";
import { deleteDescription, isCopy, splitCurriculums } from "./curriculumGroups";
import { Curriculum } from "@/lib/types";

const make = (id: number, tailored_for: string | null, job_board_entry_id: number | null = null) =>
  ({ id, tailored_for, job_board_entry_id }) as Curriculum;

describe("isCopy", () => {
  it("is true for a named company", () => {
    expect(isCopy({ tailored_for: "Acme" })).toBe(true);
  });
  it("is false for null and blank", () => {
    expect(isCopy({ tailored_for: null })).toBe(false);
    expect(isCopy({ tailored_for: "  " })).toBe(false);
  });
});

describe("splitCurriculums", () => {
  it("splits masters from copies preserving order", () => {
    const list = [make(1, null), make(2, "Acme", 9), make(3, null), make(4, "Globex", null)];
    const { masters, copies } = splitCurriculums(list);
    expect(masters.map((c) => c.id)).toEqual([1, 3]);
    expect(copies.map((c) => c.id)).toEqual([2, 4]);
  });
});

describe("deleteDescription", () => {
  it("warns when the curriculum is a job's CV", () => {
    expect(deleteDescription({ cv_for_job: { id: 1, company: "Acme" } })).toBe(
      "This is the CV for your Acme application; its CV slot will be empty.",
    );
  });
  it("falls back to the library note", () => {
    expect(deleteDescription({ cv_for_job: null })).toBe("Your library is not affected.");
    expect(deleteDescription(null)).toBe("Your library is not affected.");
  });
});
