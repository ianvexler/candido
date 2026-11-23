import apiClient from "@/api/apiClient";
import { SectionFields, SectionTemplate } from "@/lib/types";

type UpdateSectionTemplateResponse = {
  section_template: SectionTemplate;
};

export type UpdateSectionTemplatePayload = Partial<SectionFields>;

export const updateSectionTemplate = async (
  id: number,
  payload: UpdateSectionTemplatePayload
): Promise<UpdateSectionTemplateResponse> => {
  const response = await apiClient.put(`/section_templates/${id}`, payload);
  return response.data;
};
