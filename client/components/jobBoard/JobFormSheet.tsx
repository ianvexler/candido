"use client";

import { createJobBoardEntry } from "@/api/resources/jobBoardEntries/createJobBoardEntry";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { emptyJobFields, fromDateInput, hasRequiredFields, isBlankJob } from "@/lib/jobBoard/jobFields";
import { useJobFields } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry } from "@/lib/types";
import { XIcon } from "lucide-react";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { DescriptionSection, JobFacts, JobHeader, StatusPill } from "./form/JobFields";

interface JobFormSheetProps {
  /** For suggesting tags. */
  allEntries: JobBoardEntry[];
  onClose: () => void;
  onAddJob: (job: JobBoardEntry) => void;
}

/** The side panel for adding a job, laid out like a job's own. Nothing is added until it's asked for. */
const JobFormSheet = ({ allEntries, onClose, onAddJob }: JobFormSheetProps) => {
  const { fields, setField, editor } = useJobFields(emptyJobFields());
  const [creating, setCreating] = useState(false);
  // A new job's empty fields are only wrong once adding it is tried.
  const [showErrors, setShowErrors] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const create = async () => {
    if (creating) return;
    if (!hasRequiredFields(fields)) {
      setShowErrors(true);
      return;
    }

    setCreating(true);
    try {
      const { job_board_entry } = await createJobBoardEntry(
        fields.title,
        fields.company,
        fields.location,
        fields.salary,
        fields.url,
        fields.status,
        fields.description,
        fields.tags,
        fromDateInput(fields.closingDate) ?? undefined
      );
      toast.success("Job added successfully");
      onAddJob(job_board_entry);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Failed to add job");
    } finally {
      setCreating(false);
    }
  };

  const close = () => {
    if (creating) return;
    if (isBlankJob(fields)) onClose();
    else setConfirmClose(true);
  };

  return (
    <SheetContent
      showCloseButton={false}
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => {
        event.preventDefault();
        close();
      }}
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        close();
      }}
      className="flex w-full flex-col gap-0 border-l border-border p-0 sm:max-w-2xl"
    >
      <SheetTitle className="sr-only">Add job</SheetTitle>

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void create();
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-muted/30"
      >
        <div className="flex flex-col px-6 pb-8 pt-6 sm:px-9 sm:pt-7">
          <JobHeader
            fields={fields}
            setField={setField}
            disabled={creating}
            invalid={showErrors}
            showErrors={showErrors}
            actions={
              <>
                <StatusPill fields={fields} setField={setField} disabled={creating} />
                <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
                  <XIcon />
                </Button>
              </>
            }
          />
          <JobFacts fields={fields} setField={setField} disabled={creating} allEntries={allEntries} />
          <DescriptionSection editor={editor} />
          <Button type="submit" disabled={creating} className="mt-7 w-full sm:w-auto sm:self-start">
            {creating ? "Adding…" : "Add job"}
          </Button>
        </div>
      </form>

      <ConfirmationModal
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={create}
        onCancel={onClose}
        title="Discard new job?"
        description="Do you want to discard or add this job?"
        confirmLabel="Add job"
        cancelLabel="Discard"
      />
    </SheetContent>
  );
};

export default JobFormSheet;
