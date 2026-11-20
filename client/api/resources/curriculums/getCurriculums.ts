import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

export const getCurriculums = async (): Promise<{ curriculums: Curriculum[] }> => {
  const response = await apiClient.get("/curriculums");
  return response.data;
};
