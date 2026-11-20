import apiClient from "@/api/apiClient";
import { SectionTemplate } from "@/lib/types";

type GetSectionTemplatesResponse = {
  section_templates: SectionTemplate[];
};

export const getSectionTemplates = async (): Promise<GetSectionTemplatesResponse> => {
  const response = await apiClient.get("/section_templates");
  return response.data;
};
