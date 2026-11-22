interface LeaveAfterSaveOptions {
  /** True when the sheet has edits the server may not have yet. */
  hasUnsavedEdits: boolean;
  /** The save currently in flight, if any. */
  inFlight: Promise<unknown> | null;
  /** Saves the sheet's current fields; resolves false when it couldn't. */
  save: () => Promise<boolean>;
  /** The action the user wanted (open the picker, open the CV editor). */
  run: () => void;
  /** The save couldn't happen: let the user discard and continue, or keep editing. */
  onBlocked: () => void;
}

/** Saves the job first so nothing is lost, then runs the action; if saving fails, hands over to the user. */
export const leaveAfterSave = async ({ hasUnsavedEdits, inFlight, save, run, onBlocked }: LeaveAfterSaveOptions) => {
  if (!hasUnsavedEdits && !inFlight) {
    run();
    return;
  }
  if (inFlight) await inFlight.catch(() => undefined);
  if (await save()) run();
  else onBlocked();
};
