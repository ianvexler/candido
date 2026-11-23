import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

/** Adds an empty section of the given type to the end of the CV, titled after the type. */
export const addEmptyCurriculumSection = async (
  curriculumId: number,
  sectionType: string
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.post(`/curriculums/${curriculumId}/sections`, { section_type: sectionType });
  return response.data;
};
