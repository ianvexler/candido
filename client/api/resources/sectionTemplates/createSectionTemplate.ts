import apiClient from "@/api/apiClient";
import { SectionTemplate } from "@/lib/types";

type CreateSectionTemplateResponse = {
  section_template: SectionTemplate;
};

export type CreateSectionTemplatePayload = {
  title: string;
  section_type: string;
  description?: string;
  content?: string;
};

export const createSectionTemplate = async (
  payload: CreateSectionTemplatePayload
): Promise<CreateSectionTemplateResponse> => {
  const response = await apiClient.post("/section_templates", payload);
  return response.data;
};
