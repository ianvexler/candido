import apiClient from "@/api/apiClient";
import { SectionTemplateItem } from "@/lib/types";

type UpdateSectionTemplateItemResponse = {
  item: SectionTemplateItem;
};

export const updateSectionTemplateItem = async (
  sectionTemplateId: number,
  itemId: number,
  payload: { hidden?: boolean; body?: string; kind?: string }
): Promise<UpdateSectionTemplateItemResponse> => {
  const response = await apiClient.put(
    `/section_templates/${sectionTemplateId}/items/${itemId}`,
    payload
  );
  return response.data;
};
