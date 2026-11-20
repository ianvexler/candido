import apiClient from "@/api/apiClient";

export const deleteSectionTemplateItem = async (sectionTemplateId: number, itemId: number) => {
  const response = await apiClient.delete(`/section_templates/${sectionTemplateId}/items/${itemId}`);
  return response.data;
};
