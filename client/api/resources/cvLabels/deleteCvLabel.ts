import apiClient from "@/api/apiClient";
import { CvLabel } from "@/lib/types";

export const deleteCvLabel = async (id: number): Promise<{ cv_label: CvLabel }> => {
  const response = await apiClient.delete(`/cv_labels/${id}`);
  return response.data;
};
