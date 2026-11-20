import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

/** `sectionIds` must list every section in the CV, in the new order. */
export const reorderCurriculumSections = async (
  curriculumId: number,
  sectionIds: number[]
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.put(`/curriculums/${curriculumId}/sections/order`, {
    section_ids: sectionIds,
  });
  return response.data;
};
