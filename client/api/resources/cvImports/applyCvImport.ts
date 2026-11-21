import apiClient from "@/api/apiClient";
import { CvImport, ResumeHeader, SectionTemplate } from "@/lib/types";

export type ApplyCvImportResponse = {
  cv_import: CvImport;
  section_templates: SectionTemplate[];
  profile: ResumeHeader;
};

/** Adds the chosen sections (by index into the draft) and optionally fills empty profile fields. */
export const applyCvImport = async (
  id: number,
  payload: { section_indexes: number[]; fill_profile: boolean }
): Promise<ApplyCvImportResponse> => {
  const response = await apiClient.post(`/cv_imports/${id}/apply`, payload);
  return response.data;
};
