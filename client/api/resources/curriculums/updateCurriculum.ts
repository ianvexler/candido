import apiClient from "@/api/apiClient";
import { DesignSettings } from "@/lib/resume/design";
import { Curriculum, CurriculumLayout, PaperSize, ResumeHeader } from "@/lib/types";

export type UpdateCurriculumPayload = {
  title?: string;
  description?: string | null;
  layout?: CurriculumLayout;
  /** Replaces this resume's header overrides. Blank fields fall back to the profile. */
  header?: Partial<ResumeHeader>;
  /** Merged into the resume's existing styles: paper size and design settings. */
  styles?: { paper?: PaperSize } & Partial<DesignSettings>;
  /** Identifies the open page sending numbered style saves. */
  styles_writer?: string;
  /** Counts up with each save from that page; a lower number arriving late is ignored. */
  styles_seq?: number;
};

export const updateCurriculum = async (
  id: number,
  payload: UpdateCurriculumPayload
): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.put(`/curriculums/${id}`, payload);
  return response.data;
};
