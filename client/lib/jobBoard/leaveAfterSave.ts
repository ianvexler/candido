interface LeaveAfterSaveOptions {
  /** True when the sheet has edits the server may not have yet. */
  hasUnsavedEdits: boolean;
  /** The save currently in flight, if any; resolves false when it failed. */
  inFlight: Promise<boolean> | null;
  /** After the in-flight save, whether anything changed that it didn't send. */
  editedSinceInFlight: () => boolean;
  /** Saves the sheet's current fields; resolves false when it couldn't. */
  save: () => Promise<boolean>;
  /** The action the user wanted (open the picker, open the CV editor). */
  run: () => void;
  /** The save couldn't happen: let the user discard and continue, or keep editing. */
  onBlocked: () => void;
}

/** Saves the job first so nothing is lost, then runs the action; if saving fails, hands over to the user. */
export const leaveAfterSave = async ({
  hasUnsavedEdits,
  inFlight,
  editedSinceInFlight,
  save,
  run,
  onBlocked,
}: LeaveAfterSaveOptions) => {
  if (!hasUnsavedEdits && !inFlight) {
    run();
    return;
  }
  if (inFlight) {
    const saved = await inFlight.catch(() => false);
    // That save already has everything, so don't send it again.
    if (saved && !editedSinceInFlight()) {
      run();
      return;
    }
  }
  if (await save()) run();
  else onBlocked();
};
