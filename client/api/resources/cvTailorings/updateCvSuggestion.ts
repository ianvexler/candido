import apiClient from "@/api/apiClient";
import { CvSuggestion } from "@/lib/types";

export const updateCvSuggestion = async (
  id: number,
  body: { status: "accepted" | "edited" | "rejected"; replacement?: string },
): Promise<{ suggestion: CvSuggestion }> => {
  const response = await apiClient.put(`/cv_tailoring_suggestions/${id}`, body);
  return response.data;
};
