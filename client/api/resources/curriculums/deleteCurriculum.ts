import apiClient from "@/api/apiClient";

export const deleteCurriculum = async (id: number) => {
  const response = await apiClient.delete(`/curriculums/${id}`);
  return response.data;
};
