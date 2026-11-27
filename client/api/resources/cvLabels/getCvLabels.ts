import apiClient from "@/api/apiClient";
import { CvLabel } from "@/lib/types";

export const getCvLabels = async (): Promise<{ cv_labels: CvLabel[] }> => {
  const response = await apiClient.get("/cv_labels");
  return response.data;
};
