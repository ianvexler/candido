import apiClient from "@/api/apiClient";
import { DesignSettings } from "@/lib/resume/design";
import { ResumeDesign } from "@/lib/types";

export const createResumeDesign = async (payload: {
  name: string;
  settings: DesignSettings;
  is_default?: boolean;
}): Promise<{ resume_design: ResumeDesign }> => {
  const response = await apiClient.post("/resume_designs", payload);
  return response.data;
};
