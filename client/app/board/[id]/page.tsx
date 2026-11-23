"use client";

import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import { getJobBoardEntry } from "@/api/resources/jobBoardEntries/getJobBoardEntry";
import Loader from "@/components/common/Loader";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import { applyEntryPatch, EntryPatch } from "@/lib/jobBoard/docSlot";
import { useNotes } from "@/lib/jobBoard/useNotes";
import { JobBoardEntry } from "@/lib/types";
import { capitalize } from "@/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

interface BoardJobEntryPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}

const BoardJobEntryPage = ({ params, searchParams }: BoardJobEntryPageProps) => {
  const { id } = use(params);
  const { from } = use(searchParams);
  // A new job starts from a clean page.
  return <JobPage key={id} id={id} from={from === "sheet" ? "sheet" : "board"} />;
};

/** Preparing a job's application, with the job's own fields beside it. */
const JobPage = ({ id, from }: { id: string; from: "board" | "sheet" }) => {
  const router = useRouter();
  const [entry, setEntry] = useState<JobBoardEntry>();
  const [allEntries, setAllEntries] = useState<JobBoardEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const { notes, addNote } = useNotes(entry?.id);

  useEffect(() => {
    let cancelled = false;
    // The other jobs are needed for tags and for column order when the status changes.
    Promise.all([getJobBoardEntry(id), getJobBoardEntries()])
      .then(([job, jobs]) => {
        if (cancelled) return;
        setEntry(job.job_board_entry);
        setAllEntries(jobs.job_board_entries);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const patchEntry = useCallback((entryId: number, patch: EntryPatch) => {
    setEntry((prev) => prev && applyEntryPatch(prev, entryId, patch));
  }, []);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="font-medium">This job could not be loaded.</p>
        <Link href={`/${from}`} className="text-sm underline">
          Back to the {from}
        </Link>
      </div>
    );
  }

  if (!entry || !allEntries) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <JobFormSheet
      mode="edit"
      layout="page"
      back={
        <Link
          href={`/${from}?job=${entry.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {capitalize(from)}
        </Link>
      }
      entry={entry}
      allEntries={allEntries}
      onClose={() => router.push(`/${from}`)}
      onPatchJob={patchEntry}
      notes={notes[entry.id] ?? []}
      notesLoading={notes[entry.id] === undefined}
      onNoteAdded={(note) => addNote(entry.id, note)}
    />
  );
};

export default BoardJobEntryPage;
