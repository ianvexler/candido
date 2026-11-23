"use client";

import { rerunCvTailoring } from "@/api/resources/cvTailorings/rerunCvTailoring";
import { getLatestCvTailoring } from "@/api/resources/cvTailorings/getLatestCvTailoring";
import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import { getJobBoardEntry } from "@/api/resources/jobBoardEntries/getJobBoardEntry";
import { updateJobBoardEntry } from "@/api/resources/jobBoardEntries/updateJobBoardEntry";
import { getNotes } from "@/api/resources/notes/getNotes";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import Title from "@/components/common/Title";
import DocSlot from "@/components/jobBoard/entry/DocSlot";
import JobApply from "@/components/jobBoard/entry/JobApply";
import JobCvCard from "@/components/jobBoard/entry/JobCvCard";
import JobDetails from "@/components/jobBoard/entry/JobDetails";
import JobPanel from "@/components/jobBoard/entry/JobPanel";
import JobSteps from "@/components/jobBoard/entry/JobSteps";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import NotesArea from "@/components/jobBoard/NotesArea";
import { Sheet } from "@/components/ui/Sheet";
import { useAuth } from "@/contexts/AuthContext";
import { closesLabel } from "@/lib/dashboard/chart";
import { applyEntryPatch, coverLetterSlotState, EntryPatch, jobSavePatch, jobSaveStarted } from "@/lib/jobBoard/docSlot";
import { postingUrl, readiness, tailoringPatch } from "@/lib/jobBoard/readiness";
import { pollUntil } from "@/lib/poll";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { isTailoringActive } from "@/lib/resume/suggestions";
import { CvTailoring, JobBoardEntry, jobStatusColors, JobStatus, Note } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

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

const JobPage = ({ id, from }: { id: string; from: "board" | "sheet" }) => {
  const router = useRouter();
  const { user } = useAuth();
  const [entry, setEntry] = useState<JobBoardEntry>();
  const [loadError, setLoadError] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [tailoring, setTailoring] = useState<CvTailoring | null>(null);
  const [starting, setStarting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  // The edit sheet needs the other jobs, for tags and column order; null while closed.
  const [allEntries, setAllEntries] = useState<JobBoardEntry[] | null>(null);
  const [openingEdit, setOpeningEdit] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Reopening starts the form from the job as it is then.
  const [editVersion, setEditVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getJobBoardEntry(id)
      .then((response) => {
        if (!cancelled) setEntry(response.job_board_entry);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError(true);
      });
    getNotes(Number(id))
      .then((response) => {
        if (!cancelled) setNotes(response.notes);
      })
      .catch((error) => {
        console.error(error);
        if (cancelled) return;
        toast.error("Failed to get notes");
        setNotes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Saves name only the fields they set and the job they're for, so a late one can't undo newer changes.
  const patchEntry = useCallback((entryId: number, patch: EntryPatch) => {
    setEntry((prev) => prev && applyEntryPatch(prev, entryId, patch));
  }, []);

  const copyId = entry?.cv_curriculum?.id;
  const takeTailoring = useCallback(
    (curriculumId: number, next: CvTailoring | null) => {
      setTailoring(next);
      patchEntry(Number(id), tailoringPatch(curriculumId, next));
    },
    [id, patchEntry]
  );

  // Loads the CV's review, then keeps checking while it runs. The timeout outlasts the longest review.
  const active = isTailoringActive(tailoring);
  useEffect(() => {
    if (copyId === undefined) {
      setTailoring(null);
      return;
    }
    const controller = new AbortController();
    pollUntil(
      async () => {
        const { cv_tailoring } = await getLatestCvTailoring(copyId);
        if (!controller.signal.aborted) takeTailoring(copyId, cv_tailoring);
        return cv_tailoring;
      },
      (latest) => !isTailoringActive(latest),
      { intervalMs: 3000, timeoutMs: 20 * 60_000, signal: controller.signal }
    ).catch((error) => {
      if (controller.signal.aborted) return;
      console.error(error);
      setReviewError("Couldn't check on the review. Reload the page to try again.");
    });
    return () => controller.abort();
    // `active` restarts it when a review is started here.
  }, [copyId, active, takeTailoring]);

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

  if (!entry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  const startReview = async () => {
    if (copyId === undefined) return;
    setStarting(true);
    setReviewError(null);
    try {
      takeTailoring(copyId, (await rerunCvTailoring(copyId)).cv_tailoring);
    } catch (error) {
      console.error(error);
      setReviewError(apiErrorMessage(error, "Couldn't start the review. Try again."));
    } finally {
      setStarting(false);
    }
  };

  const markApplied = async () => {
    setApplying(true);
    try {
      const { job_board_entries } = await getJobBoardEntries();
      const last = Math.max(0, ...job_board_entries.filter((e) => e.status === JobStatus.APPLIED).map((e) => e.number));
      const startedAt = jobSaveStarted();
      const { job_board_entry } = await updateJobBoardEntry(
        entry.id, entry.title, entry.company, entry.location ?? "", entry.salary ?? "", entry.url ?? "",
        entry.description ?? "", JobStatus.APPLIED, last + 1
      );
      patchEntry(entry.id, jobSavePatch(job_board_entry, startedAt));
      toast.success("Moved to Applied");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't move the job. Try again.");
    } finally {
      setApplying(false);
    }
  };

  const openEdit = async () => {
    setOpeningEdit(true);
    try {
      setAllEntries((await getJobBoardEntries()).job_board_entries);
      setEditVersion((version) => version + 1);
      setEditOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't open the details. Try again.");
    } finally {
      setOpeningEdit(false);
    }
  };

  const ready = readiness(entry, user?.reviews_available ?? true);
  const hasCoverLetter = coverLetterSlotState(entry) !== "empty";

  return (
    <PageContainer className="max-w-6xl pt-6 sm:pt-8">
      <Link
        href={`/${from}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        {capitalize(from)}
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 break-words">
          <Title>{entry.title}</Title>
          <p className="mt-1 text-muted-foreground">
            {[entry.company, entry.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5">
            <span className={cn("size-2 rounded-full", jobStatusColors[entry.status])} aria-hidden />
            {capitalize(entry.status.toLowerCase())}
          </span>
          {ready && entry.closing_date && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-900">
              {closesLabel(String(entry.closing_date))}
            </span>
          )}
        </div>
      </header>

      {ready && (
        <div className="mt-6">
          <JobSteps readiness={ready} hasCoverLetter={hasCoverLetter} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <JobCvCard
            entry={entry}
            readiness={ready}
            tailoring={tailoring}
            starting={starting}
            error={reviewError}
            onReview={() => void startReview()}
            onPatchEntry={patchEntry}
          />
          <JobPanel title="Cover letter">
            <DocSlot kind="cover_letter" entry={entry} onPatchEntry={patchEntry} />
          </JobPanel>
          {ready && (
            <JobApply
              // Back to asking nothing if the link changes.
              key={postingUrl(entry.url)}
              entry={entry}
              isNext={ready.state === "ready"}
              saving={applying}
              onApplied={() => void markApplied()}
            />
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <JobDetails entry={entry} onEdit={() => void openEdit()} loading={openingEdit} />
          <JobPanel title="Notes">
            <NotesArea
              jobBoardEntry={entry}
              notes={notes ?? []}
              loading={notes === null}
              onNoteAdded={(note) => setNotes((prev) => [...(prev ?? []), note])}
            />
          </JobPanel>
        </div>
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        {allEntries && (
          <JobFormSheet
            key={editVersion}
            mode="edit"
            entry={entry}
            allEntries={allEntries}
            onClose={() => setEditOpen(false)}
            onPatchJob={patchEntry}
            onDelete={() => router.replace(`/${from}`)}
          />
        )}
      </Sheet>
    </PageContainer>
  );
};

export default BoardJobEntryPage;
