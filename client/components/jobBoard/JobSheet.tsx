"use client";

import { useNotes } from "@/lib/jobBoard/useNotes";
import { Sheet } from "@/components/ui/Sheet";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { JobBoardEntry } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import JobPanel from "./JobPanel";

// As long as the sheet takes to slide out.
const CLOSE_MS = 300;

interface JobSheetProps {
  /** The open job; undefined while closed. */
  entry: JobBoardEntry | undefined;
  allEntries: JobBoardEntry[];
  onClose: () => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  onDelete: (entry: JobBoardEntry) => void;
}

/** A job's side panel over the board. Loads the job's notes. */
const JobSheet = ({ entry, allEntries, onClose, onPatchJob, onDelete }: JobSheetProps) => {
  const router = useRouter();
  // Kept while it slides out, still following the job's saves. Then it goes, so the next opening
  // starts from the job as it is by then: it may be moved on the board meanwhile.
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);
  const job = entry ?? allEntries.find(({ id }) => id === shown?.id) ?? shown;

  const isOpen = entry !== undefined;
  useEffect(() => {
    if (isOpen) return;
    const timer = setTimeout(() => setShown(undefined), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const { notes, addNote } = useNotes(entry?.id);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {job && (
        <JobPanel
          // One panel per job: its fields start from the job, so a reused one would save the
          // previous job's fields onto this one.
          key={job.id}
          entry={job}
          allEntries={allEntries}
          onClose={onClose}
          onPrepare={() => router.push(`/board/${job.id}`)}
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
