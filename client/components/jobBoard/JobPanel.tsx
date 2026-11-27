"use client";

import { Button } from "@/components/ui/Button";
import { SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { JobBoardEntry, Note } from "@/lib/types";
import { XIcon } from "lucide-react";
import JobDetails, { useJobEditor } from "./JobDetails";

interface JobPanelProps {
  entry: JobBoardEntry;
  allEntries: JobBoardEntry[];
  onClose: () => void;
  /** Opens the full view. */
  onPrepare: () => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  onDelete: (entry: JobBoardEntry) => void;
  notes: Note[];
  notesLoading: boolean;
  onNoteAdded: (note: Note) => void;
}

/** A job's side panel, for tracking it. Key it by the job's id. */
const JobPanel = ({
  entry, allEntries, onClose, onPrepare, onPatchJob, onDelete, notes, notesLoading, onNoteAdded,
}: JobPanelProps) => {
  const job = useJobEditor(entry, allEntries, onPatchJob);
  // Edits save by themselves, so closing only asks when saving isn't possible.
  const close = () => job.form.beforeLeave(onClose);

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
      <SheetTitle className="sr-only">Edit job: {job.fields.title || "Untitled"}</SheetTitle>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
        <JobDetails
          job={job}
          entry={entry}
          allEntries={allEntries}
          onPrepare={onPrepare}
          onPatchJob={onPatchJob}
          onMoved={onClose}
          onDeleted={() => {
            onDelete(entry);
            onClose();
          }}
          notes={notes}
          notesLoading={notesLoading}
          onNoteAdded={onNoteAdded}
          action={
            <Button type="button" variant="ghost" size="icon-sm" onClick={close} aria-label="Close">
              <XIcon />
            </Button>
          }
          className="px-6 pb-8 pt-6 sm:px-9 sm:pt-7"
        />
      </div>
    </SheetContent>
  );
};

export default JobPanel;
