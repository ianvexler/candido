"use client";

import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import Loader from "@/components/common/Loader";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { closesLabel } from "@/lib/dashboard/chart";
import { cvSlotState } from "@/lib/jobBoard/docSlot";
import { jobsToTailor } from "@/lib/jobBoard/tailorJobs";
import { useTailorForJob } from "@/lib/jobBoard/useTailorForJob";
import { Curriculum, JobBoardEntry } from "@/lib/types";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";

interface TailorToJobProps {
  /** The CV to tailor. */
  curriculum: Curriculum;
  onClose: () => void;
}

/** Pick the job to tailor a CV for, or add one. Mount it only while in use, so each opening starts fresh. */
const TailorToJob = ({ curriculum, onClose }: TailorToJobProps) => {
  const { tailor, busyJobId } = useTailorForJob();
  const [entries, setEntries] = useState<JobBoardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [replacing, setReplacing] = useState<JobBoardEntry | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJobBoardEntries()
      .then((response) => {
        if (!cancelled) setEntries(response.job_board_entries);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async (job: JobBoardEntry) => {
    if (await tailor(curriculum.id, job.id)) onClose();
  };
  const jobs = entries && jobsToTailor(entries);
  const busy = busyJobId !== null;

  return (
    <>
      <Dialog.Root open={!adding && !replacing} onOpenChange={(open) => !open && !busy && !adding && !replacing && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
            <Dialog.Title className="text-lg font-semibold break-words">Tailor {curriculum.title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">
              Pick the job. Your original isn&apos;t changed.
            </Dialog.Description>

            <div className="mt-4 min-h-0 overflow-y-auto border-y border-border">
              {failed ? (
                <p role="alert" className="py-6 text-sm text-destructive">
                  Couldn&apos;t load your jobs. Close this and try again.
                </p>
              ) : jobs === null ? (
                <div className="flex justify-center py-8">
                  <Loader />
                </div>
              ) : jobs.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">No jobs waiting to be applied to. Add one to tailor for it.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {jobs.map((job) => (
                    <li key={job.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => (cvSlotState(job) === "empty" ? void start(job) : setReplacing(job))}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-3 text-left hover:bg-muted/50 disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{job.title}</span>
                          <span className="block truncate text-sm text-muted-foreground">{job.company}</span>
                        </span>
                        {busyJobId === job.id ? (
                          <Loader2Icon className="size-4 shrink-0 animate-spin" aria-label="Copying" />
                        ) : (
                          <span className="shrink-0 text-right text-xs text-muted-foreground">
                            {job.closing_date && <span className="block">{closesLabel(new Date(job.closing_date).toISOString())}</span>}
                            {cvSlotState(job) !== "empty" && <span className="block">Has a CV</span>}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding(true)} disabled={busy || entries === null}>
                <PlusIcon />
                Add a job
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Sheet open={adding} onOpenChange={(open) => !open && setAdding(false)}>
        {adding && (
          <JobFormSheet
            allEntries={entries ?? []}
            onClose={() => setAdding(false)}
            onAddJob={(job) => {
              // Listed too, so it isn't added again if copying fails.
              setEntries((current) => [...(current ?? []), job]);
              void start(job);
            }}
          />
        )}
      </Sheet>

      <ConfirmationModal
        isOpen={replacing !== null}
        onClose={() => setReplacing(null)}
        onConfirm={() => {
          if (replacing) void start(replacing);
        }}
        title="Replace this job's CV?"
        description={`${replacing?.company ?? "This job"} already has a CV. It's replaced by a copy of ${curriculum.title}, and any review of it is lost.`}
        confirmLabel="Replace"
        variant="destructive"
      />
    </>
  );
};

export default TailorToJob;
