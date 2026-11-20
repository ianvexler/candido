import apiClient from "@/api/apiClient";
import { User } from "@/lib/types";

type ResendVerificationResponse = {
  user: User;
  message: string;
};

const resendVerification = async (userId: number): Promise<ResendVerificationResponse> => {
  const response = await apiClient.post(`/users/${userId}/resend_verification`);
  return response.data;
};

export default resendVerification;
