import apiClient from "@/api/apiClient";
import { CvImport } from "@/lib/types";

/** Uploads a CV (PDF or .docx). Reading happens in the background; poll getCvImport. */
export const createCvImport = async (file: File, signal?: AbortSignal): Promise<{ cv_import: CvImport }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post("/cv_imports", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
    signal,
  });
  return response.data;
};
