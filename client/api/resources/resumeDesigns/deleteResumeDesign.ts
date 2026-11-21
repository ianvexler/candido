import apiClient from "@/api/apiClient";

export const deleteResumeDesign = async (id: number) => {
  const response = await apiClient.delete(`/resume_designs/${id}`);
  return response.data;
};
