import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

export type IncludePayload = {
  section_template_id: number;
  /** Only this entry of it. */
  entry_id?: string;
  /** Only this item of the entry. */
  item_id?: string;
};

/** Ticks library content, copying in what the CV lacks. Changes the section's first copy, by id. */
export const includeFromLibrary = async (
  curriculumId: number,
  payload: IncludePayload
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.post(`/curriculums/${curriculumId}/include`, payload);
  return response.data;
};
