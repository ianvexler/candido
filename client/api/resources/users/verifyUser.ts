import apiClient from "@/api/apiClient";
import { User } from "@/lib/types";

type VerifyUserResponse = {
  user: User;
  message: string;
};

const verifyUser = async (userId: number): Promise<VerifyUserResponse> => {
  const response = await apiClient.post(`/users/${userId}/verify`);
  return response.data;
};

export default verifyUser;
