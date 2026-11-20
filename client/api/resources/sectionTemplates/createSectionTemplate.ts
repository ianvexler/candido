import apiClient from "@/api/apiClient";
import { SectionTemplate, SectionTemplateItemKind } from "@/lib/types";

type CreateSectionTemplateResponse = {
  section_template: SectionTemplate;
};

export type CreateSectionTemplatePayload = {
  title: string;
  section_type: string;
  description?: string;
  items?: { kind: SectionTemplateItemKind; body: string; hidden?: boolean }[];
};

export const createSectionTemplate = async (
  payload: CreateSectionTemplatePayload
): Promise<CreateSectionTemplateResponse> => {
  const response = await apiClient.post("/section_templates", payload);
  return response.data;
};
