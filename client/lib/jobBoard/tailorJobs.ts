import { Curriculum, JobBoardEntry, JobStatus } from "@/lib/types";
import { readiness } from "./readiness";

/** Jobs not applied to yet, soonest closing first; ones without a date, then ones already closed, come after. */
export const jobsToTailor = (entries: JobBoardEntry[], now = new Date()): JobBoardEntry[] => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rank = (entry: JobBoardEntry) => {
    if (!entry.closing_date) return 1;
    return new Date(entry.closing_date).getTime() < today ? 2 : 0;
  };
  const closes = (entry: JobBoardEntry) => (entry.closing_date ? new Date(entry.closing_date).getTime() : 0);

  return entries
    .filter((entry) => entry.status === JobStatus.PENDING)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        closes(a) - closes(b) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
};

/** How a tailored copy stands; null once its job has been applied to, or if the job was removed. */
export const copyReadiness = (copy: Pick<Curriculum, "id" | "title" | "updated_at" | "tailoring">, reviewsAvailable: boolean) => {
  const { tailoring } = copy;
  if (!tailoring?.job) return null;
  return readiness(
    {
      status: tailoring.job.status,
      cv_curriculum: {
        id: copy.id,
        title: copy.title,
        updated_at: String(copy.updated_at),
        fit: tailoring.fit,
        review_status: tailoring.review_status,
        pending_suggestions: tailoring.pending_suggestions,
      },
    },
    reviewsAvailable
  );
};
