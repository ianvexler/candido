import apiClient from "@/api/apiClient";
import { CvTailoring } from "@/lib/types";

export const getLatestCvTailoring = async (curriculumId: number): Promise<{ cv_tailoring: CvTailoring | null }> => {
  const response = await apiClient.get(`/curriculums/${curriculumId}/tailoring`);
  return response.data;
};
