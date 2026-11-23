import apiClient from "@/api/apiClient";
import { SectionEntry, SectionTemplate } from "@/lib/types";

type CreateSectionTemplateResponse = {
  section_template: SectionTemplate;
};

export type CreateSectionTemplatePayload = {
  section_type: string;
  entries?: SectionEntry[];
};

export const createSectionTemplate = async (
  payload: CreateSectionTemplatePayload
): Promise<CreateSectionTemplateResponse> => {
  const response = await apiClient.post("/section_templates", payload);
  return response.data;
};
