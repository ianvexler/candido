import apiClient from "@/api/apiClient";

export const deleteCurriculumSection = async (curriculumId: number, sectionId: number) => {
  const response = await apiClient.delete(`/curriculums/${curriculumId}/sections/${sectionId}`);
  return response.data;
};
