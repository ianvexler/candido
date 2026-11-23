"use client";

import { Button } from "@/components/ui/Button";
import { SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useAuth } from "@/contexts/AuthContext";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { jobFieldsOf } from "@/lib/jobBoard/jobFields";
import { prepareAction, readiness } from "@/lib/jobBoard/readiness";
import { useJobAutosave } from "@/lib/jobBoard/useJobAutosave";
import { useJobFields } from "@/lib/jobBoard/useJobFields";
import { JobBoardEntry, JobStatus, Note } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArchiveIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { useState } from "react";
import DocSlot from "./entry/DocSlot";
import DescriptionEditor from "./form/DescriptionEditor";
import JobPrompts from "./form/JobPrompts";
import PanelFields from "./form/PanelFields";
import PanelHeader from "./form/PanelHeader";
import SaveStatus from "./form/SaveStatus";
import NotesArea from "./NotesArea";

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
  const { user } = useAuth();
  const { fields, setField, reset, editor } = useJobFields(jobFieldsOf(entry));
  const form = useJobAutosave({ entry, allEntries, fields, setField, reset, onPatchJob });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const { busy, saving } = form;
  const ready = readiness(entry, user?.reviews_available ?? true);
  const prepare = prepareAction(ready);
  const close = () => form.beforeLeave(onClose);

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
      <SheetTitle className="sr-only">Edit job: {fields.title || "Untitled"}</SheetTitle>
      <PanelHeader fields={fields} setField={setField} disabled={busy} showErrors={form.showErrors} onClose={close}>
        <SaveStatus status={form.status} />
      </PanelHeader>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              !ready ? "bg-border" : ready.state === "ready" ? "bg-emerald-500" : "bg-candido"
            )}
            aria-hidden
          />
          <span className="truncate">{prepare.detail ?? capitalize(entry.status.toLowerCase())}</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant={ready ? "candido" : "ghost"}
          className="shrink-0"
          onClick={() => form.beforeLeave(onPrepare)}
        >
          {prepare.label}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <PanelFields fields={fields} setField={setField} allEntries={allEntries} disabled={busy} showErrors={form.showErrors} />

        <Tabs defaultValue="description" className="w-full">
          <TabsList>
            <TabsTrigger value="description" className="px-4">Description</TabsTrigger>
            <TabsTrigger value="notes" className="px-4">Notes</TabsTrigger>
            <TabsTrigger value="documents" className="px-4">Documents</TabsTrigger>
          </TabsList>

          {/* Kept mounted, so switching tabs doesn't lose the editor's history or a half-typed document. */}
          <TabsContent value="description" forceMount className="data-[state=inactive]:hidden">
            <DescriptionEditor editor={editor} contentClassName="min-h-[140px]" />
          </TabsContent>
          <TabsContent value="notes" forceMount className="data-[state=inactive]:hidden">
            <NotesArea jobId={entry.id} notes={notes} loading={notesLoading} onNoteAdded={onNoteAdded} />
          </TabsContent>
          <TabsContent value="documents" forceMount className="data-[state=inactive]:hidden">
            <div className="divide-y divide-border rounded-lg border border-border [&>*]:px-4 [&>*]:py-3">
              <DocSlot kind="cv" entry={entry} onPatchEntry={onPatchJob} beforeLeave={form.beforeLeave} canTailor={false} />
              <DocSlot kind="cover_letter" entry={entry} onPatchEntry={onPatchJob} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || saving}
              onClick={() => void form.moveTo(JobStatus.REJECTED, onClose)}
            >
              <XCircleIcon />
              Rejected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || saving}
              onClick={() => void form.moveTo(JobStatus.ARCHIVED, onClose)}
            >
              <ArchiveIcon />
              Archive
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy || saving} onClick={() => setIsDeleteOpen(true)}>
              <Trash2Icon />
              Delete
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Created: {format(new Date(entry.created_at), "d MMM yyyy")}, updated: {format(new Date(entry.updated_at), "d MMM yyyy")}
          </p>
        </div>
      </div>

      <JobPrompts
        entry={entry}
        form={form}
        isDeleteOpen={isDeleteOpen}
        onDeleteClose={() => setIsDeleteOpen(false)}
        onDelete={() =>
          void form.remove(() => {
            onDelete(entry);
            onClose();
          })
        }
      />
    </SheetContent>
  );
};

export default JobPanel;
