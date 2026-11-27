import apiClient from "@/api/apiClient";

type MessageResponse = { message: string };

export const resetPassword = async (token: string, password: string): Promise<MessageResponse> => {
  const { data } = await apiClient.post<MessageResponse>("/sessions/reset_password", { token, password });
  return data;
};
