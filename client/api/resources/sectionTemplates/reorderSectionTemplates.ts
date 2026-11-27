import apiClient from "@/api/apiClient";
import { SectionTemplate } from "@/lib/types";

/** Puts the whole library in this order. */
export const reorderSectionTemplates = async (ids: number[]): Promise<{ section_templates: SectionTemplate[] }> => {
  const response = await apiClient.put("/section_templates/order", { ids });
  return response.data;
};
