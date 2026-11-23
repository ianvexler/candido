import { CvTailoring, JobBoardEntry, JobStatus } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { applyEntryPatch } from "./docSlot";
import { postingUrl, prepareAction, readiness, tailoringPatch } from "./readiness";

type Copy = NonNullable<JobBoardEntry["cv_curriculum"]>;

const copy = (overrides: Partial<Copy> = {}): Copy => ({
  id: 1, title: "CV", updated_at: "2026-11-22T00:00:00Z", fit: null, review_status: null, pending_suggestions: 0, ...overrides,
});
const entry = (overrides: Partial<JobBoardEntry> = {}) =>
  ({ id: 7, status: JobStatus.PENDING, cv_curriculum: null, ...overrides }) as JobBoardEntry;
const withCopy = (overrides: Partial<Copy>) => entry({ cv_curriculum: copy(overrides) });
const state = (e: JobBoardEntry, available = true) => readiness(e, available)?.state;

describe("readiness", () => {
  it("has no state once the job has been applied to", () => {
    Object.values(JobStatus)
      .filter((status) => status !== JobStatus.PENDING)
      .forEach((status) => expect(readiness(entry({ status }), true)).toBeNull());
  });

  it("follows the CV and its latest review", () => {
    expect(state(entry())).toBe("no_cv");
    expect(state(entry({ cv_key: "k" }))).toBe("ready");
    expect(state(entry({ cv_text: "text" }))).toBe("ready");
    expect(state(withCopy({}))).toBe("not_reviewed");
    expect(state(withCopy({ review_status: "pending" }))).toBe("reviewing");
    expect(state(withCopy({ review_status: "processing" }))).toBe("reviewing");
    expect(state(withCopy({ review_status: "failed" }))).toBe("failed");
    expect(state(withCopy({ review_status: "succeeded", pending_suggestions: 2 }))).toBe("suggestions");
    expect(state(withCopy({ review_status: "succeeded" }))).toBe("ready");
  });

  it("doesn't ask for a review when none can run", () => {
    expect(state(withCopy({}), false)).toBe("ready");
    expect(state(withCopy({ review_status: "failed" }), false)).toBe("ready");
    expect(state(entry(), false)).toBe("no_cv");
  });

  it("labels the suggestions left and keeps the last known fit", () => {
    expect(readiness(withCopy({ review_status: "succeeded", pending_suggestions: 1, fit: "weak" }), true)).toEqual({
      state: "suggestions", label: "1 suggestion left", fit: "weak",
    });
    expect(readiness(withCopy({ review_status: "succeeded", pending_suggestions: 3 }), true)?.label).toBe("3 suggestions left");
  });
});

describe("tailoringPatch", () => {
  const tailoring = {
    status: "succeeded", report: { fit: "strong" }, suggestions: [{ status: "pending" }, { status: "accepted" }],
  } as unknown as CvTailoring;

  it("takes the review's status, fit and open suggestions", () => {
    const next = applyEntryPatch(withCopy({}), 7, tailoringPatch(1, tailoring));
    expect(next.cv_curriculum).toMatchObject({ review_status: "succeeded", fit: "strong", pending_suggestions: 1 });
  });

  it("keeps the last fit while a new review runs", () => {
    const running = { status: "processing", report: null, suggestions: [] } as unknown as CvTailoring;
    const next = applyEntryPatch(withCopy({ fit: "weak" }), 7, tailoringPatch(1, running));
    expect(next.cv_curriculum).toMatchObject({ review_status: "processing", fit: "weak" });
  });

  it("leaves a CV that was replaced meanwhile alone", () => {
    const current = entry({ cv_curriculum: copy({ id: 2 }) });
    expect(applyEntryPatch(current, 7, tailoringPatch(1, tailoring))).toEqual(current);
  });
});

describe("postingUrl", () => {
  it("accepts web addresses, with or without a scheme", () => {
    expect(postingUrl("https://a.example/job")).toBe("https://a.example/job");
    expect(postingUrl(" a.example/job ")).toBe("https://a.example/job");
    expect(postingUrl("a.example:8443/job")).toBe("https://a.example:8443/job");
  });
  it("rejects anything else", () => {
    ["", "  ", "javascript:alert(1)", "data:text/html,x", "mailto:a@b.example", "not a url"].forEach((url) => expect(postingUrl(url)).toBeNull());
    expect(postingUrl(undefined)).toBeNull();
  });
});

describe("prepareAction", () => {
  const action = (e: JobBoardEntry, available = true) => prepareAction(readiness(e, available));
  it("follows how far the application is", () => {
    expect(action(entry())).toEqual({ label: "Prepare application", detail: "No CV chosen yet" });
    expect(action(withCopy({}))).toEqual({ label: "Prepare application", detail: "CV not tailored yet" });
    expect(action(withCopy({ review_status: "processing" }))).toEqual({ label: "Continue application", detail: "Reviewing…" });
    expect(action(withCopy({ review_status: "succeeded", pending_suggestions: 2 }))).toEqual({
      label: "Continue application", detail: "2 suggestions left",
    });
    expect(action(entry({ cv_key: "k" }))).toEqual({ label: "Finish application", detail: "Ready to apply" });
    expect(action(entry({ status: JobStatus.APPLIED }))).toEqual({ label: "View application", detail: null });
  });
});
