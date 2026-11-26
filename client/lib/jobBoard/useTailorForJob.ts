import { createCvTailoring } from "@/api/resources/cvTailorings/createCvTailoring";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

/** Copies a CV for a job and opens the job's application view. The review is started there, by the user. */
export const useTailorForJob = () => {
  const router = useRouter();
  const [busyJobId, setBusyJobId] = useState<number | null>(null);

  const tailor = async (curriculumId: number, jobId: number): Promise<boolean> => {
    setBusyJobId(jobId);
    try {
      await createCvTailoring(jobId, curriculumId, { review: false });
      router.push(`/board/${jobId}`);
      return true;
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Couldn't copy the CV. Try again."));
      return false;
    } finally {
      setBusyJobId(null);
    }
  };

  return { tailor, busyJobId };
};
