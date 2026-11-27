import { waitForSaves } from "./saveTracker";

/** Saves everything that can be saved soon, and says how that went. */
export const flushAll = async (flushes: (() => Promise<boolean>)[]): Promise<"saved" | "saving" | "failed"> => {
  let failed = false;
  const flushed = Promise.all(
    flushes.map(async (flush) => {
      if (!(await flush())) failed = true;
    })
  );
  if (await waitForSaves()) await flushed;
  else if (!failed) return "saving";
  return failed ? "failed" : "saved";
};
