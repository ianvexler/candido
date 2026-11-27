import apiClient from "@/api/apiClient";

type MessageResponse = { message: string };

export const forgotPassword = async (email: string): Promise<MessageResponse> => {
  const { data } = await apiClient.post<MessageResponse>("/sessions/forgot_password", { email });
  return data;
};
