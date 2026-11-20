import apiClient from "@/api/apiClient";
import { ResumeHeader } from "@/lib/types";

export const updateResumeProfile = async (profile: ResumeHeader): Promise<{ profile: ResumeHeader }> => {
  const response = await apiClient.put("/resume_profile", { profile });
  return response.data;
};
