import apiClient from "@/api/apiClient";
import { SectionTemplateItem, SectionTemplateItemKind } from "@/lib/types";

type CreateSectionTemplateItemResponse = {
  item: SectionTemplateItem;
};

export const createSectionTemplateItem = async (
  sectionTemplateId: number,
  payload: { kind: SectionTemplateItemKind; body: string }
): Promise<CreateSectionTemplateItemResponse> => {
  const response = await apiClient.post(`/section_templates/${sectionTemplateId}/items`, payload);
  return response.data;
};
