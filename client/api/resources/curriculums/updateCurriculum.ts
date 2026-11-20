import apiClient from "@/api/apiClient";
import { Curriculum, CurriculumLayout, PaperSize, ResumeHeader } from "@/lib/types";

export type UpdateCurriculumPayload = {
  title?: string;
  description?: string | null;
  layout?: CurriculumLayout;
  /** Replaces this resume's header overrides. Blank fields fall back to the profile. */
  header?: Partial<ResumeHeader>;
  /** Merged into the resume's existing styles. */
  styles?: { paper?: PaperSize };
};

export const updateCurriculum = async (
  id: number,
  payload: UpdateCurriculumPayload
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.put(`/curriculums/${id}`, payload);
  return response.data;
};
