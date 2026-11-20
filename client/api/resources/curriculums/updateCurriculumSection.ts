import apiClient from "@/api/apiClient";
import { CurriculumSection, SectionFields } from "@/lib/types";

export type UpdateCurriculumSectionPayload = Partial<SectionFields> & { hidden?: boolean };

export const updateCurriculumSection = async (
  curriculumId: number,
  sectionId: number,
  payload: UpdateCurriculumSectionPayload
): Promise<{ section: CurriculumSection }> => {
  const response = await apiClient.put(`/curriculums/${curriculumId}/sections/${sectionId}`, payload);
  return response.data;
};
