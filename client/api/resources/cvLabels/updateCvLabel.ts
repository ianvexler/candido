import apiClient from "@/api/apiClient";
import { CvLabel } from "@/lib/types";

export const updateCvLabel = async (id: number, name: string): Promise<{ cv_label: CvLabel }> => {
  const response = await apiClient.put(`/cv_labels/${id}`, { name });
  return response.data;
};
