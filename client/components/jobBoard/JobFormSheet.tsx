"use client";

import { createJobBoardEntry } from "@/api/resources/jobBoardEntries/createJobBoardEntry";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { emptyJobFields, fromDateInput, hasRequiredFields, isBlankJob } from "@/lib/jobBoard/jobFields";
import { useJobFields } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry } from "@/lib/types";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import DescriptionEditor from "./form/DescriptionEditor";
import PanelFields, { PanelLabel } from "./form/PanelFields";
import PanelHeader from "./form/PanelHeader";

interface JobFormSheetProps {
  /** For suggesting tags. */
  allEntries: JobBoardEntry[];
  onClose: () => void;
  onAddJob: (job: JobBoardEntry) => void;
}

/** The side panel for adding a job. Nothing is added until it's asked for. */
const JobFormSheet = ({ allEntries, onClose, onAddJob }: JobFormSheetProps) => {
  const { fields, setField, editor } = useJobFields(emptyJobFields());
  const [creating, setCreating] = useState(false);
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
      <SheetTitle className="sr-only">Create job</SheetTitle>
      <PanelHeader fields={fields} setField={setField} disabled={creating} showErrors={showErrors} onClose={close} />

      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void create();
        }}
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
      >
        <PanelFields fields={fields} setField={setField} allEntries={allEntries} disabled={creating} showErrors={showErrors} />
        <div className="flex flex-col gap-2">
          <PanelLabel>Description</PanelLabel>
          <DescriptionEditor editor={editor} contentClassName="min-h-[140px]" />
        </div>
        <Button type="submit" disabled={creating} className="w-fit">
          {creating ? "Creating..." : "Create"}
        </Button>
      </form>

      <ConfirmationModal
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={create}
        onCancel={onClose}
        title="Discard new job?"
        description="Do you want to discard or add this job?"
        confirmLabel="Create"
        cancelLabel="Discard"
      />
    </SheetContent>
  );
};

export default JobFormSheet;
