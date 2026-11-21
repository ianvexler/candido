import apiClient from "@/api/apiClient";
import { CvTailoring, Curriculum } from "@/lib/types";

/** Copies a resume for a job and starts reviewing it. Poll getLatestCvTailoring on the copy. */
export const createCvTailoring = async (
  jobId: number,
  curriculumId: number,
): Promise<{ curriculum: Curriculum; cv_tailoring: CvTailoring }> => {
  const response = await apiClient.post(`/job_board_entries/${jobId}/tailorings`, {
    curriculum_id: curriculumId,
  });
  return response.data;
};
