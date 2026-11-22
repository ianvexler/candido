import apiClient from "@/api/apiClient";
import { CvTailoring, Curriculum } from "@/lib/types";

/**
 * Copies a resume for a job. With a review (the default) the copy is also reviewed;
 * poll getLatestCvTailoring on the copy. Without one, cv_tailoring is null.
 */
export const createCvTailoring = async (
  jobId: number,
  curriculumId: number,
  options: { review?: boolean } = {},
): Promise<{ curriculum: Curriculum; cv_tailoring: CvTailoring | null }> => {
  const response = await apiClient.post(`/job_board_entries/${jobId}/tailorings`, {
    curriculum_id: curriculumId,
    review: options.review ?? true,
  });
  return response.data;
};
