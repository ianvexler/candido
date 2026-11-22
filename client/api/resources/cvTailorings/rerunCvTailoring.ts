import apiClient from "@/api/apiClient";
import { CvTailoring } from "@/lib/types";

/** Starts a fresh review of an existing tailored resume. */
export const rerunCvTailoring = async (curriculumId: number): Promise<{ cv_tailoring: CvTailoring }> => {
  const response = await apiClient.post(`/curriculums/${curriculumId}/tailorings`);
  return response.data;
};
