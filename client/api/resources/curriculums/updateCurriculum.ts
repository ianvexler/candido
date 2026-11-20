import apiClient from "@/api/apiClient";
import { Curriculum, CurriculumLayout } from "@/lib/types";

export type UpdateCurriculumPayload = {
  title?: string;
  description?: string | null;
  layout?: CurriculumLayout;
};

export const updateCurriculum = async (
  id: number,
  payload: UpdateCurriculumPayload
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.put(`/curriculums/${id}`, payload);
  return response.data;
};
