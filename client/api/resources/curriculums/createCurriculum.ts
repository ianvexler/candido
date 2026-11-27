import apiClient from "@/api/apiClient";
import { Curriculum, CurriculumLayout } from "@/lib/types";

export type CreateCurriculumPayload = {
  /** Optional with `whole_library`, which then names it. */
  title?: string;
  description?: string | null;
  layout?: CurriculumLayout;
  /** Library sections to copy in, in this order. */
  section_template_ids?: number[];
  /** Starts from all of the library. */
  whole_library?: boolean;
  /** With `whole_library`: the purpose it is for; null or absent for Everything. */
  cv_label_id?: number | null;
};

export const createCurriculum = async (payload: CreateCurriculumPayload): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.post("/curriculums", payload);
  return response.data;
};
