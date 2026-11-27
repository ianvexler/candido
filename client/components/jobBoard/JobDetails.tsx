"use client";

import FitBadge from "@/components/common/FitBadge";
import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { useAuth } from "@/contexts/AuthContext";
import { coverLetterSlotState, cvSlotState, EntryPatch } from "@/lib/jobBoard/docSlot";
import { jobFieldsOf } from "@/lib/jobBoard/jobFields";
import { prepareAction, readiness } from "@/lib/jobBoard/readiness";
import { useJobAutosave } from "@/lib/jobBoard/useJobAutosave";
import { useJobFields } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry, JobStatus, Note } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ArchiveIcon, ArrowUpRightIcon, FileTextIcon, FileUserIcon, Loader2Icon, MoreHorizontalIcon, Trash2Icon, XCircleIcon,
} from "lucide-react";
import { ReactNode, useState, useTransition } from "react";
import DocSlot from "./entry/DocSlot";
import { DescriptionSection, JobFacts, JobHeader, PaneSection, StatusPill } from "./form/JobFields";
import JobPrompts from "./form/JobPrompts";
import SaveStatus from "./form/SaveStatus";
import NotesArea from "./NotesArea";

/** A job's fields, their autosave and the description editor. Mount it again (key it by the job) for another job. */
export const useJobEditor = (
  entry: JobBoardEntry,
  allEntries: JobBoardEntry[],
  onPatchJob: (id: number, patch: EntryPatch) => void
) => {
  const { fields, setField, reset, editor } = useJobFields(jobFieldsOf(entry));
  const form = useJobAutosave({ entry, allEntries, fields, setField, reset, onPatchJob });
  return { fields, setField, editor, form };
};

export type JobEditor = ReturnType<typeof useJobEditor>;

interface JobDetailsProps {
  job: JobEditor;
  entry: JobBoardEntry;
  allEntries: JobBoardEntry[];
  /** Opens the full view. */
  onPrepare: () => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  /** The job was moved to Rejected or Archived. */
  onMoved: () => void;
  onDeleted: () => void;
  notes: Note[];
  notesLoading: boolean;
  onNoteAdded: (note: Note) => void;
  /** At the end of the title's line, e.g. a close button. */
  action?: ReactNode;
  className?: string;
}

/** A document's state at a glance: amber while it's missing, green once it's attached. */
const DocStateIcon = ({ filled, icon }: { filled: boolean; icon: ReactNode }) => (
  <span
    aria-hidden
    className={cn(
      "mr-1 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4",
      filled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-candido/25 text-candido-ink dark:text-candido"
    )}
  >
    {icon}
  </span>
);

/** A job edited in place: beside the applications list, and in the board's side panel. */
const JobDetails = ({
  job, entry, allEntries, onPrepare, onPatchJob, onMoved, onDeleted, notes, notesLoading, onNoteAdded, action, className,
}: JobDetailsProps) => {
  const { user } = useAuth();
  const { fields, setField, editor, form } = job;
  const { busy, saving } = form;
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // Pending until the full page has loaded, so a slow load shows progress instead of a dead click.
  const [opening, startOpening] = useTransition();

  const ready = readiness(entry, user?.reviews_available ?? true);
  const prepare = prepareAction(ready);
  const cvState = cvSlotState(entry);

  return (
    <div className={cn("flex flex-col", className)}>
      <JobHeader
        fields={fields}
        setField={setField}
        disabled={busy}
        invalid
        showErrors={form.showErrors}
        actions={
          <>
            <SaveStatus status={form.status} />
            <StatusPill fields={fields} setField={setField} disabled={busy} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="More job actions" disabled={busy || saving}>
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void form.moveTo(JobStatus.REJECTED, onMoved)}>
                  <XCircleIcon />
                  Move to Rejected
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void form.moveTo(JobStatus.ARCHIVED, onMoved)}>
                  <ArchiveIcon />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {action}
          </>
        }
      />

      <JobFacts fields={fields} setField={setField} disabled={busy} allEntries={allEntries} />

      <DescriptionSection editor={editor} />

      <PaneSection title="Documents" aside={entry.cv_curriculum?.fit ? <FitBadge fit={entry.cv_curriculum.fit} /> : null}>
        <div className="divide-y divide-border rounded-lg border border-border bg-background [&>*]:px-4 [&>*]:py-3">
          <DocSlot
            kind="cv"
            entry={entry}
            onPatchEntry={onPatchJob}
            beforeLeave={form.beforeLeave}
            isNext={cvState === "empty"}
            leading={<DocStateIcon filled={cvState !== "empty"} icon={<FileUserIcon />} />}
          />
          <DocSlot
            kind="cover_letter"
            entry={entry}
            onPatchEntry={onPatchJob}
            leading={<DocStateIcon filled={coverLetterSlotState(entry) !== "empty"} icon={<FileTextIcon />} />}
          />
        </div>
        {/* The way on from here: at the end of the row, like a form's next step. */}
        <div className="mt-3 flex sm:justify-end">
          <Button
            type="button"
            size="sm"
            variant={ready && ready.state !== "no_cv" ? "candido" : "outline"}
            className="w-full sm:w-auto"
            disabled={opening}
            onClick={() => form.beforeLeave(() => startOpening(onPrepare))}
          >
            {opening ? "Opening…" : prepare.label}
            {opening ? <Loader2Icon className="animate-spin" /> : <ArrowUpRightIcon />}
          </Button>
        </div>
      </PaneSection>

      <PaneSection title="Notes">
        <NotesArea jobId={entry.id} notes={notes} loading={notesLoading} onNoteAdded={onNoteAdded} />
      </PaneSection>

      <p className="mt-7 text-xs text-muted-foreground">
        Added {format(new Date(entry.created_at), "d MMM yyyy")}
        <span className="mx-2 text-border">·</span>
        Updated {format(new Date(entry.updated_at), "d MMM yyyy")}
      </p>

      <JobPrompts
        entry={entry}
        form={form}
        isDeleteOpen={isDeleteOpen}
        onDeleteClose={() => setIsDeleteOpen(false)}
        onDelete={() => void form.remove(onDeleted)}
      />
    </div>
  );
};

export default JobDetails;
