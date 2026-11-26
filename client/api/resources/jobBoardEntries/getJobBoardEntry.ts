import apiClient from "@/api/apiClient";
import { waitForSaves } from "@/lib/resume/saveTracker";
import { JobBoardEntry } from "@/lib/types";

type GetJobBoardEntryResponse = {
  job_board_entry: JobBoardEntry;
};

export const getJobBoardEntry = async (id: string): Promise<GetJobBoardEntryResponse> => {
  // A job's last edits may still be on their way from the page just left.
  await waitForSaves();
  const response = await apiClient.get(`/job_board_entries/${id}`);
  return response.data;
};
