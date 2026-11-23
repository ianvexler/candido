import { updateCurrentUser } from "@/api/resources/users/updateCurrentUser";
import useAuthStore from "@/lib/stores/authStore";
import { useCallback } from "react";

/** Marks the first run as done, here and on the server. Failing to save only means it's offered again. */
export const useFinishSetup = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  return useCallback(async () => {
    if (!user || user.setup_completed) return;
    setUser({ ...user, setup_completed: true });
    try {
      await updateCurrentUser(true);
    } catch (error) {
      console.error(error);
    }
  }, [user, setUser]);
};
