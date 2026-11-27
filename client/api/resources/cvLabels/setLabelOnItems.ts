import apiClient from "@/api/apiClient";
import { SectionTemplate } from "@/lib/types";

/** An entry or item of a library section; an entry's id labels the entry. */
export type LabelTarget = { section_template_id: number; id: string };

/** Adds the label to these (`on`) or takes it off. Returns the sections that changed. */
export const setLabelOnItems = async (
  labelId: number,
  on: boolean,
  targets: LabelTarget[]
): Promise<{ section_templates: SectionTemplate[] }> => {
  const response = await apiClient.put(`/cv_labels/${labelId}/items`, { on, targets });
  return response.data;
};
