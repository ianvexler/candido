import apiClient from "@/api/apiClient";
import { Curriculum } from "@/lib/types";

export const getCurriculum = async (id: number | string): Promise<{ curriculum: Curriculum }> => {
  const response = await apiClient.get(`/curriculums/${id}`);
  return response.data;
};
