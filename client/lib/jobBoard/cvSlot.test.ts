import { describe, expect, it, vi } from "vitest";
import { afterCopyCreated, cvSlotState, entryWithCopy, entryWithUpload, isReviewUnavailable } from "./cvSlot";
import { JobBoardEntry } from "@/lib/types";

const base = {
  id: 7,
  company: "Acme",
  cv_curriculum: null,
  cv_text: undefined,
  cv_key: undefined,
  cv_filename: undefined,
} as unknown as JobBoardEntry;

describe("cvSlotState", () => {
  it("is empty with nothing set", () => {
    expect(cvSlotState(base)).toBe("empty");
    expect(cvSlotState({ ...base, cv_text: "  " })).toBe("empty");
  });
  it("prefers a linked copy, then a file, then text", () => {
    const copy = { id: 1, title: "Main", updated_at: "2026-11-22T00:00:00Z", fit: null };
    expect(cvSlotState({ ...base, cv_curriculum: copy, cv_key: "k", cv_text: "t" })).toBe("copy");
    expect(cvSlotState({ ...base, cv_key: "k", cv_text: "t" })).toBe("file");
    expect(cvSlotState({ ...base, cv_text: "t" })).toBe("text");
  });
});

describe("entryWithCopy", () => {
  it("links the copy without a fit and clears the upload and text", () => {
    const entry = { ...base, cv_key: "k", cv_filename: "cv.pdf", cv_text: "t" };
    const result = entryWithCopy(entry, { id: 3, title: "Main – Acme", updated_at: "2026-11-22T10:00:00Z" as unknown as Date });
    expect(result.cv_curriculum).toEqual({ id: 3, title: "Main – Acme", updated_at: "2026-11-22T10:00:00Z", fit: null });
    expect(result.cv_key).toBeUndefined();
    expect(result.cv_filename).toBeUndefined();
    expect(result.cv_text).toBeUndefined();
    expect(result.company).toBe("Acme");
  });
});

describe("afterCopyCreated", () => {
  const copy = { id: 3, title: "Main – Acme", updated_at: "2026-11-22T10:00:00Z" as unknown as Date };

  it("links the copy before asking to leave, then opens it", () => {
    const calls: string[] = [];
    afterCopyCreated({
      entry: base,
      copy,
      onUpdateEntry: (entry) => calls.push(`update:${entry.cv_curriculum?.id}`),
      beforeLeave: (action) => {
        calls.push("beforeLeave");
        action();
      },
      navigate: (href) => calls.push(`navigate:${href}`),
    });
    expect(calls).toEqual(["update:3", "beforeLeave", "navigate:/resume/3"]);
  });

  it("stays on the page with the copy linked when the leave is held back", () => {
    const onUpdateEntry = vi.fn();
    const navigate = vi.fn();
    afterCopyCreated({ entry: base, copy, onUpdateEntry, beforeLeave: () => {}, navigate });
    expect(onUpdateEntry).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("entryWithUpload", () => {
  it("takes the new fields and unlinks any copy", () => {
    const entry = { ...base, cv_curriculum: { id: 1, title: "Main", updated_at: "x", fit: "weak" as const } };
    const result = entryWithUpload(entry, { cv_key: "k2", cv_filename: "new.pdf", cv_text: undefined });
    expect(result.cv_curriculum).toBeNull();
    expect(result.cv_key).toBe("k2");
    expect(result.cv_filename).toBe("new.pdf");
  });
});

describe("isReviewUnavailable", () => {
  it("is true for 503 and 429 only", () => {
    expect(isReviewUnavailable({ response: { status: 503 } })).toBe(true);
    expect(isReviewUnavailable({ response: { status: 429 } })).toBe(true);
    expect(isReviewUnavailable({ response: { status: 500 } })).toBe(false);
    expect(isReviewUnavailable(new Error("x"))).toBe(false);
  });
});
