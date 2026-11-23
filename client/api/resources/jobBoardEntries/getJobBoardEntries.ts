import { JobBoardEntry } from "@/lib/types";
import { waitForSaves } from "@/lib/resume/saveTracker";
import apiClient from "../../apiClient";

type GetJobBoardEntriesResponse = {
  job_board_entries: JobBoardEntry[];
  is_empty: boolean;
};

export const getJobBoardEntries = async (): Promise<GetJobBoardEntriesResponse> => {
  // A job's last edits may still be on their way from the page just left.
  await waitForSaves();
  const response = await apiClient.get('/job_board_entries');
  return response.data;
};
