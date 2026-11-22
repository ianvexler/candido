import { describe, expect, it, vi } from "vitest";
import {
  afterCopyCreated,
  applyEntryPatch,
  copyPatch,
  coverLetterSlotState,
  DOC_KINDS,
  cvSlotState,
  isReviewUnavailable,
  jobSavePatch,
  replaceWays,
  textPreview,
} from "./docSlot";
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

describe("isReviewUnavailable", () => {
  it("is true for 503 and 429 only", () => {
    expect(isReviewUnavailable({ response: { status: 503 } })).toBe(true);
    expect(isReviewUnavailable({ response: { status: 429 } })).toBe(true);
    expect(isReviewUnavailable({ response: { status: 500 } })).toBe(false);
    expect(isReviewUnavailable(new Error("x"))).toBe(false);
  });
});

describe("coverLetterSlotState", () => {
  it("prefers a file, then non-blank text", () => {
    expect(coverLetterSlotState(base)).toBe("empty");
    expect(coverLetterSlotState({ ...base, cover_letter_text: "  " })).toBe("empty");
    expect(coverLetterSlotState({ ...base, cover_letter_key: "k", cover_letter_text: "t" })).toBe("file");
    expect(coverLetterSlotState({ ...base, cover_letter_text: "t" })).toBe("text");
  });
});

describe("DOC_KINDS", () => {
  it("offers copies only for the CV", () => {
    expect(DOC_KINDS.cv.ways).toEqual(["upload", "paste", "use"]);
    expect(DOC_KINDS.cover_letter.ways).toEqual(["upload", "paste"]);
  });
  it("reads each document's own fields", () => {
    const entry = { ...base, cv_key: "cv-k", cv_text: "cv", cv_filename: "cv.pdf", cover_letter_key: "cl-k", cover_letter_text: "cl", cover_letter_filename: "cl.pdf" };
    expect(DOC_KINDS.cv.doc(entry)).toEqual({ key: "cv-k", text: "cv", filename: "cv.pdf" });
    expect(DOC_KINDS.cover_letter.doc(entry)).toEqual({ key: "cl-k", text: "cl", filename: "cl.pdf" });
    expect(DOC_KINDS.cover_letter.state({ ...base, cv_key: "k" })).toBe("empty");
  });
});

describe("replaceWays", () => {
  it("drops pasting for pasted text, which is edited instead", () => {
    expect(replaceWays("cv", "text")).toEqual(["upload", "use"]);
    expect(replaceWays("cv", "file")).toEqual(["upload", "paste", "use"]);
    expect(replaceWays("cover_letter", "text")).toEqual(["upload"]);
  });
});

describe("textPreview", () => {
  it("drops blank lines so the preview shows content", () => {
    expect(textPreview("Dear Initech team,\n\n  I am applying.\n")).toBe("Dear Initech team,\nI am applying.");
    expect(textPreview(undefined)).toBe("");
  });
});

const copy = { id: 3, title: "Main – Acme", updated_at: "2026-11-22T10:00:00Z" as unknown as Date };
const linked = { id: 3, title: "Main – Acme", updated_at: "2026-11-22T10:00:00Z", fit: null };

describe("applyEntryPatch", () => {
  it("patches only the job it was made for", () => {
    const other = { ...base, id: 8, cover_letter_text: "B's letter" };
    expect(applyEntryPatch(other, 7, { cover_letter_text: "A's letter" })).toBe(other);
    expect(applyEntryPatch(base, 7, { cover_letter_text: "A's letter" }).cover_letter_text).toBe("A's letter");
  });
  it("hands a function patch the job as it is when the patch lands", () => {
    const current = { ...base, company: "Newer" };
    expect(applyEntryPatch(current, 7, (e) => ({ title: `${e.company} job` })).title).toBe("Newer job");
  });
});

describe("copyPatch", () => {
  it("links the copy without a fit and clears the upload and text", () => {
    const result = applyEntryPatch({ ...base, cv_key: "k", cv_filename: "cv.pdf", cv_text: "t" }, 7, copyPatch(copy));
    expect(result.cv_curriculum).toEqual(linked);
    expect(result.cv_key).toBeUndefined();
    expect(result.cv_filename).toBeUndefined();
    expect(result.cv_text).toBeUndefined();
    expect(result.company).toBe("Acme");
  });
});

describe("afterCopyCreated", () => {
  it("links the copy on the job it was made for before asking to leave, then opens it", () => {
    const calls: string[] = [];
    afterCopyCreated({
      entryId: 7,
      copy,
      onPatchEntry: (id, patch) => calls.push(`patch:${id}:${(patch as { cv_curriculum: { id: number } }).cv_curriculum.id}`),
      beforeLeave: (action) => {
        calls.push("beforeLeave");
        action();
      },
      navigate: (href) => calls.push(`navigate:${href}`),
    });
    expect(calls).toEqual(["patch:7:3", "beforeLeave", "navigate:/resume/3"]);
  });

  it("stays on the page with the copy linked when the leave is held back", () => {
    const onPatchEntry = vi.fn();
    const navigate = vi.fn();
    afterCopyCreated({ entryId: 7, copy, onPatchEntry, beforeLeave: () => {}, navigate });
    expect(onPatchEntry).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("DOC_KINDS patches", () => {
  const saved = { ...base, company: "Server", cv_key: "k2", cv_filename: "new.pdf", cover_letter_text: "Dear…" };

  it("sets only the CV fields from an upload, unlinking any copy", () => {
    expect(DOC_KINDS.cv.patch(saved)).toEqual({ cv_curriculum: null, cv_text: undefined, cv_key: "k2", cv_filename: "new.pdf" });
  });
  it("sets only the cover letter fields, keeping the CV", () => {
    const current = { ...base, cv_curriculum: linked, cover_letter_key: "old" };
    const result = applyEntryPatch(current, 7, DOC_KINDS.cover_letter.patch(saved));
    expect(result).toMatchObject({ cv_curriculum: linked, company: "Acme", cover_letter_text: "Dear…" });
    expect(result.cover_letter_key).toBeUndefined();
  });
});

describe("jobSavePatch", () => {
  it("takes the job's fields but keeps documents saved while the request was out", () => {
    const current = { ...base, company: "Old", cv_curriculum: linked, cover_letter_text: "new letter" };
    const saved = { ...base, company: "New", cv_curriculum: null, cover_letter_text: null } as unknown as JobBoardEntry;
    const result = applyEntryPatch(current, 7, jobSavePatch(saved));
    expect(result.company).toBe("New");
    expect(result.cv_curriculum).toBe(linked);
    expect(result.cover_letter_text).toBe("new letter");
  });
  it("takes newer details for the same linked copy", () => {
    const fresh = { ...linked, title: "Renamed", fit: "strong" as const };
    const result = applyEntryPatch({ ...base, cv_curriculum: linked }, 7, jobSavePatch({ ...base, cv_curriculum: fresh }));
    expect(result.cv_curriculum).toEqual(fresh);
  });
  it("keeps a copy linked since the save started rather than the one it names", () => {
    const newer = { ...linked, id: 9 };
    const result = applyEntryPatch({ ...base, cv_curriculum: newer }, 7, jobSavePatch({ ...base, cv_curriculum: linked }));
    expect(result.cv_curriculum).toBe(newer);
  });
  it("does nothing to another job", () => {
    const other = { ...base, id: 8 };
    expect(applyEntryPatch(other, 7, jobSavePatch({ ...base, company: "New" }))).toBe(other);
  });
});
