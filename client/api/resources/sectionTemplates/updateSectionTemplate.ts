import apiClient from "@/api/apiClient";
import { SectionTemplate, SectionTemplateItemKind } from "@/lib/types";

type UpdateSectionTemplateResponse = {
  section_template: SectionTemplate;
};

export type UpdateSectionTemplatePayload = {
  title?: string;
  section_type?: string;
  description?: string | null;
  items?: { kind: SectionTemplateItemKind; body: string; hidden?: boolean }[];
};

export const updateSectionTemplate = async (
  id: number,
  payload: UpdateSectionTemplatePayload
): Promise<UpdateSectionTemplateResponse> => {
  const response = await apiClient.put(`/section_templates/${id}`, payload);
  return response.data;
};
