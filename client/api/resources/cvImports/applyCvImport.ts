import apiClient from "@/api/apiClient";
import { CvImport, ResumeHeader, SectionTemplate } from "@/lib/types";

export type ApplyCvImportResponse = {
  cv_import: CvImport;
  section_templates: SectionTemplate[];
  profile: ResumeHeader;
};

/** Adds the chosen entries, in sections under their headings, and optionally fills empty profile fields. */
export const applyCvImport = async (
  id: number,
  payload: { entry_ids: string[]; fill_profile: boolean }
): Promise<ApplyCvImportResponse> => {
  const response = await apiClient.post(`/cv_imports/${id}/apply`, payload);
  return response.data;
};
