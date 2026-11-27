import apiClient from "@/api/apiClient";
import { CvLabel } from "@/lib/types";

export const createCvLabel = async (name: string): Promise<{ cv_label: CvLabel }> => {
  const response = await apiClient.post("/cv_labels", { name });
  return response.data;
};
