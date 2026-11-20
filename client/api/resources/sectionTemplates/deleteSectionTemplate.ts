import apiClient from "@/api/apiClient";

export const deleteSectionTemplate = async (id: number) => {
  const response = await apiClient.delete(`/section_templates/${id}`);
  return response.data;
};
