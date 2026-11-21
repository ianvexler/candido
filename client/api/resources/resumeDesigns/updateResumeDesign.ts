import apiClient from "@/api/apiClient";
import { DesignSettings } from "@/lib/resume/design";
import { ResumeDesign } from "@/lib/types";

export const updateResumeDesign = async (
  id: number,
  payload: { name?: string; settings?: DesignSettings; is_default?: boolean }
): Promise<{ resume_design: ResumeDesign }> => {
  const response = await apiClient.put(`/resume_designs/${id}`, payload);
  return response.data;
};
