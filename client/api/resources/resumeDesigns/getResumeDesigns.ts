import apiClient from "@/api/apiClient";
import { ResumeDesign } from "@/lib/types";

export const getResumeDesigns = async (): Promise<{ resume_designs: ResumeDesign[] }> => {
  const response = await apiClient.get("/resume_designs");
  return response.data;
};
