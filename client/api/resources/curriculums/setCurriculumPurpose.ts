import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

/**
 * Changes what a CV is for (null: Everything) and ticks what fits. Without
 * `force` the request fails with a 409 (`ticks_differ`, see `isConflict`) if
 * the CV's ticks were changed since its purpose set them.
 */
export const setCurriculumPurpose = async (
  id: number,
  cvLabelId: number | null,
  force = false
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.put(`/curriculums/${id}/purpose`, { cv_label_id: cvLabelId, force });
  return response.data;
};
