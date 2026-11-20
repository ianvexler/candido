import apiClient from "@/api/apiClient";
import { Curriculum, CurriculumLayout } from "@/lib/types";

export type CreateCurriculumPayload = {
  title: string;
  description?: string | null;
  layout?: CurriculumLayout;
  /** Library sections to copy in, in this order. */
  section_template_ids?: number[];
};

export const createCurriculum = async (payload: CreateCurriculumPayload): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.post("/curriculums", payload);
  return response.data;
};
