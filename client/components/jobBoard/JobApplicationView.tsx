"use client";

import { Button } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import InlineInput from "@/components/ui/InlineInput";
import { useAuth } from "@/contexts/AuthContext";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { hasText, jobFieldsOf, JobFieldValues } from "@/lib/jobBoard/jobFields";
import { readiness } from "@/lib/jobBoard/readiness";
import { useJobAutosave } from "@/lib/jobBoard/useJobAutosave";
import { useJobFields } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry, jobStatusColors, JobStatus, Note } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { ArchiveIcon, ArrowLeftIcon, MoreHorizontalIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { ComponentProps, ReactNode, useState } from "react";
import ApplyBar from "./entry/ApplyBar";
import JobSend from "./entry/JobSend";
import DescriptionEditor from "./form/DescriptionEditor";
import JobPrompts from "./form/JobPrompts";
import SaveStatus from "./form/SaveStatus";
import StatusSelect from "./form/StatusSelect";
import NotesArea from "./NotesArea";
import TagsInput from "./TagsInput";

interface JobApplicationViewProps {
  entry: JobBoardEntry;
  allEntries: JobBoardEntry[];
  /** The page it was opened from. */
  from: "board" | "applications";
  /** Back to the job's side panel. */
  onBack: () => void;
  /** The job was moved to Rejected or Archived. */
  onMoved: () => void;
  onDeleted: () => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  notes: Note[];
  notesLoading: boolean;
  onNoteAdded: (note: Note) => void;
}

// Rem, not px: Tailwind only orders breakpoints of the same unit, and `sm:` is in rem.
const sidePadding = "px-4 sm:px-6 min-[90rem]:px-14 min-[106rem]:px-20";
const areaPadding = `${sidePadding} py-5 min-[90rem]:py-8`;

const Fact = ({ label, htmlFor, className, children }: { label: string; htmlFor?: string; className?: string; children: ReactNode }) => (
  <div className={cn("min-w-0", className)}>
    {htmlFor ? (
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </label>
    ) : (
      <span className="text-sm text-muted-foreground">{label}</span>
    )}
    {children}
  </div>
);

/** The full view of a job: its details beside the application being prepared. Key it by the job's id. */
const JobApplicationView = ({
  entry, allEntries, from, onBack, onMoved, onDeleted, onPatchJob, notes, notesLoading, onNoteAdded,
}: JobApplicationViewProps) => {
  const { user } = useAuth();
  const { fields, setField, reset, editor } = useJobFields(jobFieldsOf(entry));
  const form = useJobAutosave({ entry, allEntries, fields, setField, reset, onPatchJob });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { busy, saving } = form;
  // Null once the job has been applied to.
  const ready = readiness(entry, user?.reviews_available ?? true);

  const fact = (
    label: string,
    field: keyof Pick<JobFieldValues, "company" | "location" | "closingDate" | "salary" | "url">,
    props: ComponentProps<typeof InlineInput> = {}
  ) => (
    <Fact label={label} htmlFor={field}>
      <InlineInput
        id={field}
        autoComplete="off"
        value={fields[field]}
        onChange={(event) => setField(field, event.target.value)}
        disabled={busy}
        placeholder="Add"
        className="h-9 py-0 text-base"
        {...props}
      />
    </Fact>
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
        <header className={cn("shrink-0 border-b border-border pt-4 pb-5", sidePadding)}>
          <button
            type="button"
            onClick={() => form.beforeLeave(onBack)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            {capitalize(from)}
          </button>
          <div className="mt-2 flex items-center gap-3">
            <span className={cn("size-4 shrink-0 rounded-sm", jobStatusColors[fields.status])} aria-hidden />
            <InlineInput
              id="title"
              autoComplete="off"
              value={fields.title}
              onChange={(event) => setField("title", event.target.value)}
              disabled={busy}
              aria-label="Job title"
              aria-invalid={!fields.title.trim() || undefined}
              placeholder="Job title"
              className={cn(
                "min-w-0 flex-1 py-0 text-3xl font-semibold tracking-tight",
                fields.title.trim() && "border-b-0"
              )}
            />
            <SaveStatus status={form.status} />
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
          </div>
        </header>

        {/* Side by side, each scrolls on its own; on a phone they stack, the application first. */}
        <div className="grid shrink-0 grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[clamp(21rem,31%,34rem)_minmax(0,1fr)]">
          <section
            className={cn(
              areaPadding,
              "order-last flex min-h-0 flex-col gap-6 border-t border-border lg:order-none lg:overflow-y-auto lg:border-t-0 lg:border-r lg:pr-6 min-[90rem]:pr-8 min-[106rem]:pr-10"
            )}
          >
            <h2 className="flex min-h-9 items-center text-xl font-semibold tracking-tight">Job details</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {fact("Company", "company", { placeholder: "Required", "aria-invalid": !fields.company.trim() || undefined })}
              <Fact label="Status" htmlFor="status">
                <StatusSelect
                  value={fields.status}
                  onChange={(status) => setField("status", status)}
                  disabled={busy}
                  className="h-9! w-full rounded-none border-0 border-b border-border px-0 text-base shadow-none"
                />
              </Fact>
              {fact("Location", "location")}
              {fact("Closing date", "closingDate", { type: "date" })}
              {fact("Salary", "salary")}
              {fact("Posting link", "url")}
              <Fact label="Tags" className="col-span-2">
                <TagsInput compact allEntries={allEntries} tags={fields.tags} onTagsChange={(tags) => setField("tags", tags)} />
              </Fact>
            </div>

            <div className="flex min-h-72 flex-1 shrink-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h3 className="text-sm text-muted-foreground">Description</h3>
                {ready && !hasText(fields.description) && (
                  <p className="text-sm text-muted-foreground">Paste the posting. Your CV is compared with it.</p>
                )}
              </div>
              <DescriptionEditor
                editor={editor}
                className="flex min-h-0 flex-1 flex-col"
                contentClassName="max-h-[60vh] min-h-0 flex-1 overflow-y-auto leading-relaxed lg:max-h-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm text-muted-foreground">Notes</h3>
              <NotesArea jobId={entry.id} notes={notes} loading={notesLoading} onNoteAdded={onNoteAdded} />
            </div>
          </section>

          <section className={cn("min-h-0 bg-muted/40 lg:overflow-y-auto", areaPadding)}>
            <JobSend entry={entry} onPatchEntry={onPatchJob} beforeLeave={form.beforeLeave} />
          </section>
        </div>

        {ready && (
          // Marking as applied saves like any other edit to the job.
          <ApplyBar
            entry={entry}
            readiness={ready}
            onApplied={() => setField("status", JobStatus.APPLIED)}
            className={sidePadding}
          />
        )}
      </div>

      <JobPrompts
        entry={entry}
        form={form}
        isDeleteOpen={isDeleteOpen}
        onDeleteClose={() => setIsDeleteOpen(false)}
        onDelete={() => void form.remove(onDeleted)}
      />
    </>
  );
};

export default JobApplicationView;
