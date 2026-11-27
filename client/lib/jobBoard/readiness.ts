import { CvTailoring, CvTailoringReport, JobBoardEntry, JobStatus } from "@/lib/types";
import { cvSlotState, EntryPatch } from "./docSlot";

export type ReadinessState = "no_cv" | "not_reviewed" | "reviewing" | "failed" | "suggestions" | "ready";

export type Readiness = {
  state: ReadinessState;
  /** The review's last known fit, if the CV has been reviewed. */
  fit: CvTailoringReport["fit"] | null;
  /** e.g. "6 suggestions left". */
  label: string;
};

type ReadinessEntry = Pick<JobBoardEntry, "status" | "cv_curriculum" | "cv_key" | "cv_text">;

const stateOf = (entry: ReadinessEntry, reviewsAvailable: boolean): ReadinessState => {
  if (cvSlotState(entry) === "empty") return "no_cv";
  const copy = entry.cv_curriculum;
  // Uploaded and pasted CVs can't be reviewed.
  if (!copy) return "ready";
  switch (copy.review_status) {
    case "pending":
    case "processing":
      return "reviewing";
    case "failed":
      return reviewsAvailable ? "failed" : "ready";
    case "succeeded":
      return copy.pending_suggestions > 0 ? "suggestions" : "ready";
    default:
      return reviewsAvailable ? "not_reviewed" : "ready";
  }
};

const labelOf = (state: ReadinessState, pending: number): string => {
  switch (state) {
    case "no_cv":
      return "No CV yet";
    case "not_reviewed":
      return "CV not tailored";
    case "reviewing":
      return "Reviewing…";
    case "failed":
      return "Review failed";
    case "suggestions":
      return `${pending} ${pending === 1 ? "suggestion" : "suggestions"} left`;
    case "ready":
      return "CV ready";
  }
};

/** How far the CV for a job is; null once the job has been applied to. */
export const readiness = (entry: ReadinessEntry, reviewsAvailable: boolean): Readiness | null => {
  if (entry.status !== JobStatus.PENDING) return null;
  const state = stateOf(entry, reviewsAvailable);
  return {
    state,
    fit: entry.cv_curriculum?.fit ?? null,
    label: labelOf(state, entry.cv_curriculum?.pending_suggestions ?? 0),
  };
};

/** Brings a job's CV summary up to date with the review just loaded for that CV. */
export const tailoringPatch =
  (curriculumId: number, tailoring: CvTailoring | null): EntryPatch =>
  (current) => {
    const copy = current.cv_curriculum;
    // The CV was replaced while the review loaded.
    if (copy?.id !== curriculumId) return {};
    return {
      cv_curriculum: {
        ...copy,
        // A run that's going or failed leaves the last known fit in place.
        fit: tailoring?.report?.fit ?? copy.fit,
        review_status: tailoring?.status ?? null,
        pending_suggestions: tailoring?.suggestions.filter((s) => s.status === "pending").length ?? 0,
      },
    };
  };

/** The posting's address if it's one a browser can open, or null. */
export const postingUrl = (url: string | null | undefined): string | null => {
  const trimmed = url?.trim();
  // Browsers' URL parsers accept spaces and bare words as hosts ("not a link"), so check by hand.
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    // "jobs.example.com:8443/1" is a host and port, not a scheme.
    const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed);
    const parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    const webHost = parsed.hostname.includes(".") || parsed.hostname === "localhost";
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && webHost ? parsed.href : null;
  } catch {
    return null;
  }
};

/** The button that leads from tracking a job to preparing its application. */
export const prepareAction = (ready: Readiness | null): { label: string; detail: string | null } => {
  if (!ready) return { label: "View application", detail: null };
  switch (ready.state) {
    case "ready":
      return { label: "Finish application", detail: "Ready to apply" };
    case "suggestions":
    case "reviewing":
    case "failed":
      return { label: "Continue application", detail: ready.label };
    default:
      return { label: "Prepare application", detail: ready.state === "no_cv" ? "No CV chosen yet" : "CV not tailored yet" };
  }
};
