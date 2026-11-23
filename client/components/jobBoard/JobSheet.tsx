"use client";

import { useNotes } from "@/lib/jobBoard/useNotes";
import { Sheet } from "@/components/ui/Sheet";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { JobBoardEntry } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import JobPanel from "./JobPanel";

interface JobSheetProps {
  /** The open job; undefined while closed. */
  entry: JobBoardEntry | undefined;
  allEntries: JobBoardEntry[];
  /** The page behind it, to come back to from the full view. */
  from: "board" | "sheet";
  onClose: () => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  onDelete: (entry: JobBoardEntry) => void;
}

/** A job's side panel, over the board or sheet. Loads the job's notes. */
const JobSheet = ({ entry, allEntries, from, onClose, onPatchJob, onDelete }: JobSheetProps) => {
  const router = useRouter();
  // Kept while it slides out.
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  const job = entry ?? shown;

  const { notes, addNote } = useNotes(entry?.id);

  return (
    <Sheet open={entry !== undefined} onOpenChange={(open) => !open && onClose()}>
      {job && (
        <JobPanel
          // One panel per job: its fields start from the job, so a reused one would save the
          // previous job's fields onto this one.
          key={job.id}
          entry={job}
          allEntries={allEntries}
          onClose={onClose}
          onPrepare={() => router.push(`/board/${job.id}${from === "sheet" ? "?from=sheet" : ""}`)}
          onPatchJob={onPatchJob}
          onDelete={onDelete}
          notes={notes[job.id] ?? []}
          notesLoading={notes[job.id] === undefined}
          onNoteAdded={(note) => addNote(job.id, note)}
        />
      )}
    </Sheet>
  );
};

export default JobSheet;
