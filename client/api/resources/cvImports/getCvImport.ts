import apiClient from "@/api/apiClient";
import { CvImport } from "@/lib/types";

export const getCvImport = async (id: number): Promise<{ cv_import: CvImport }> => {
  const response = await apiClient.get(`/cv_imports/${id}`);
  return response.data;
};
