import { deleteJobBoardEntry } from "@/api/resources/jobBoardEntries/deleteJobBoardEntry";
import { updateJobBoardEntry } from "@/api/resources/jobBoardEntries/updateJobBoardEntry";
import { trackSave } from "@/lib/resume/saveTracker";
import { JobBoardEntry, JobStatus } from "@/lib/types";
import { capitalize } from "@/lib/utils";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { EntryPatch, jobSavePatch, jobSaveStarted } from "./docSlot";
import {
  fromDateInput, hasRequiredFields, jobFieldsOf, JobFieldValues, nextNumberIn, sameJobFields, toDateInput,
} from "./jobFields";
import { leaveAfterSave } from "./leaveAfterSave";
import { SetJobField } from "./useJobFields";

const SAVE_DELAY_MS = 600;

interface JobAutosaveOptions {
  entry: JobBoardEntry;
  /** Every job, for the order within a status column. */
  allEntries: JobBoardEntry[];
  fields: JobFieldValues;
  setField: SetJobField;
  reset: (values: JobFieldValues) => void;
  /** Applies a change to one job; see EntryPatch. */
  onPatchJob: (id: number, patch: EntryPatch) => void;
}

/**
 * Saves a job's edits as they're made: after a pause, before leaving, and when the form goes away
 * by any other route (the browser's back button). One save is sent at a time.
 */
export const useJobAutosave = ({ entry, allEntries, fields, setField, reset, onPatchJob }: JobAutosaveOptions) => {
  // Doesn't lock the fields: disabling one drops its focus and what's typed next.
  const [saving, setSaving] = useState(false);
  // Moving or deleting the job: locks the form.
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"saved" | "failed" | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // An action that leaves the form, waiting on the prompt about edits that couldn't be saved.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const saved = useMemo(() => jobFieldsOf(entry), [entry]);
  const dirty = !sameJobFields(fields, saved);

  // What saves read, so one started from an older render still sends the latest.
  const latest = useRef({ entry, allEntries, fields, saved, dirty, onPatchJob });
  useLayoutEffect(() => {
    latest.current = { entry, allEntries, fields, saved, dirty, onPatchJob };
  });

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<{ request: Promise<boolean>; sent: string } | null>(null);
  // The values of a save that failed: autosave waits for an edit instead of retrying them forever.
  const failed = useRef<string | null>(null);
  const removed = useRef(false);

  const send = async (values: JobFieldValues): Promise<boolean> => {
    const { entry: job, allEntries: jobs } = latest.current;
    if (!hasRequiredFields(values)) {
      setShowErrors(true);
      return false;
    }

    setSaving(true);
    try {
      const startedAt = jobSaveStarted();
      const { job_board_entry: stored } = await updateJobBoardEntry(
        job.id,
        values.title,
        values.company,
        values.location,
        values.salary,
        values.url,
        values.description,
        values.status,
        values.status === job.status ? job.number : nextNumberIn(jobs, values.status),
        values.tags,
        fromDateInput(values.closingDate)
      );
      latest.current.onPatchJob(stored.id, jobSavePatch(stored, startedAt));
      // Show the date as the server stored it, unless it was changed while this save was out.
      if (latest.current.fields.closingDate === values.closingDate) setField("closingDate", toDateInput(stored.closing_date));
      setOutcome("saved");
      return true;
    } catch (error) {
      console.error(error);
      failed.current = JSON.stringify(values);
      setOutcome("failed");
      toast.error("Failed to update job");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const startSave = (values: JobFieldValues): Promise<boolean> => {
    clearTimeout(timer.current);
    // Pages opened meanwhile wait for tracked saves before loading jobs.
    const request = trackSave(`job-${latest.current.entry.id}`, send(values));
    const current = { request, sent: JSON.stringify(values) };
    inFlight.current = current;
    void request.finally(() => {
      if (inFlight.current === current) inFlight.current = null;
    });
    return request;
  };

  /** Saves the latest values once any save in flight is done, so an older one can't land after a newer one. */
  const saveNow = async (): Promise<boolean> => {
    const current = inFlight.current;
    if (current && (await current.request) && JSON.stringify(latest.current.fields) === current.sent) return true;
    return startSave(latest.current.fields);
  };
  const saveNowRef = useRef(saveNow);
  useLayoutEffect(() => {
    saveNowRef.current = saveNow;
  });

  useEffect(() => {
    // While a prompt asks whether to keep the edits, saving them would answer for the user.
    if (!dirty || busy || saving || pendingLeave !== null) return;
    if (failed.current === JSON.stringify(fields)) return;

    timer.current = setTimeout(() => void saveNowRef.current(), SAVE_DELAY_MS);
    return () => clearTimeout(timer.current);
  }, [dirty, fields, busy, saving, pendingLeave]);

  useEffect(
    () => () => {
      const { dirty: unsaved, entry: job } = latest.current;
      if (unsaved && !removed.current) void trackSave(`job-${job.id}:leaving`, saveNowRef.current());
    },
    []
  );

  /** Saves first so nothing is lost, then runs the action; asks only if saving isn't possible. */
  const beforeLeave = (action: () => void) => {
    clearTimeout(timer.current);
    const sentNow = inFlight.current;
    void leaveAfterSave({
      hasUnsavedEdits: latest.current.dirty,
      inFlight: sentNow?.request ?? null,
      editedSinceInFlight: () => JSON.stringify(latest.current.fields) !== sentNow?.sent,
      save: () => saveNowRef.current(),
      run: action,
      onBlocked: () => setPendingLeave(() => action),
    });
  };

  const discardAndLeave = () => {
    const action = pendingLeave;
    reset(latest.current.saved);
    // Until the reset renders, so leaving in the same step doesn't save what was discarded.
    latest.current.dirty = false;
    action?.();
  };

  const moveTo = async (status: JobStatus, after: () => void) => {
    const name = capitalize(status.toLowerCase());
    clearTimeout(timer.current);
    setBusy(true);
    await inFlight.current?.request;
    if (await startSave({ ...latest.current.fields, status })) {
      setField("status", status);
      // Already saved, though the form only catches up on the next render.
      latest.current.dirty = false;
      toast.success(`Moved to ${name}`);
      after();
    } else if (!hasRequiredFields(latest.current.fields)) {
      toast.error("Add a title and company first.");
    }
    setBusy(false);
  };

  const remove = async (after: () => void) => {
    clearTimeout(timer.current);
    setBusy(true);
    try {
      await inFlight.current?.request;
      await deleteJobBoardEntry(entry.id);
      removed.current = true;
      toast.success(`Deleted ${entry.title}`);
      after();
    } catch (error) {
      console.error(error);
      toast.error(`Failed to delete ${entry.title}`);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    saving,
    showErrors,
    status: saving ? ("saving" as const) : outcome === "failed" ? ("failed" as const) : outcome && !dirty ? ("saved" as const) : null,
    beforeLeave,
    moveTo,
    remove,
    isLeaveBlocked: pendingLeave !== null,
    keepEditing: () => setPendingLeave(null),
    discardAndLeave,
  };
};

export type JobAutosave = ReturnType<typeof useJobAutosave>;
