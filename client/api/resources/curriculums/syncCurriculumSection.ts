import apiClient from "@/api/apiClient";
import { CurriculumSection } from "@/lib/types";

/** Replaces the CV's copy with the library section's current version. */
export const syncCurriculumSection = async (
  curriculumId: number,
  sectionId: number
): Promise<{ section: CurriculumSection }> => {
  const response = await apiClient.post(`/curriculums/${curriculumId}/sections/${sectionId}/sync`);
  return response.data;
};
