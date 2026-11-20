import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

/** Copies library sections onto the end of the CV. */
export const addCurriculumSections = async (
  curriculumId: number,
  sectionTemplateIds: number[]
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.post(`/curriculums/${curriculumId}/sections`, {
    section_template_ids: sectionTemplateIds,
  });
  return response.data;
};
