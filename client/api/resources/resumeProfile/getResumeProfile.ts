import apiClient from "@/api/apiClient";
import { ResumeHeader } from "@/lib/types";

export const getResumeProfile = async (): Promise<{ profile: ResumeHeader }> => {
  const response = await apiClient.get("/resume_profile");
  return response.data;
};
