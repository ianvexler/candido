"use client";

import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import BoardFilters from "@/components/jobBoard/BoardFilters";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import JobsHeader from "@/components/jobBoard/JobsHeader";
import SentList from "@/components/jobBoard/sent/SentList";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { useJobsRefresh } from "@/contexts/JobsRefreshContext";
import { useBoardFilters } from "@/hooks/useBoardFilters";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { neighbourId } from "@/lib/jobBoard/sentLog";
import { usePublishJobCounts } from "@/lib/jobBoard/useJobCounts";
import { useNotes } from "@/lib/jobBoard/useNotes";
import { useOpenJob } from "@/lib/jobBoard/useOpenJob";
import { usePatchJob } from "@/lib/jobBoard/usePatchJob";
import { JobBoardEntry, JobStatus } from "@/lib/types";
import { XIcon } from "lucide-react";
import { VisuallyHidden } from "radix-ui";
import { useRouter } from "next/navigation";
import { ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const ApplicationsPageContent = () => {
  const router = useRouter();
  const isWide = useMediaQuery("(min-width: 1024px)");
  // The selected job is kept in the address, so a refresh or the full page's back link returns to it.
  const { jobId, openJob, closeJob } = useOpenJob();
  const { refreshTrigger } = useJobsRefresh();
  const [jobBoardEntries, setJobBoardEntries] = useState<JobBoardEntry[]>([]);
  usePublishJobCounts(jobBoardEntries);
  const [isEmpty, setIsEmpty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  // Kept while the add panel slides out.
  const [addMounted, setAddMounted] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    searchInput,
    handleSearchChange,
    tags,
    handleTagToggle,
    handleClearTags,
    showRejected,
    handleToggleRejected,
    showArchived,
    handleToggleArchived,
    statusFilter,
    setStatusFilter,
    filteredEntries,
  } = useBoardFilters("applications", jobBoardEntries, setJobBoardEntries);

  // Hiding rejected or archived jobs drops them from the list (see useBoardFilters), so showing
  // them again loads the jobs afresh.
  useEffect(() => {
    let cancelled = false;
    getJobBoardEntries()
      .then((response) => {
        if (cancelled) return;
        setJobBoardEntries(response.job_board_entries);
        setIsEmpty(response.is_empty);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to get your applications");
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [showRejected, showArchived]);

  useEffect(() => {
    if (refreshTrigger === 0) return;
    getJobBoardEntries()
      .then((response) => setJobBoardEntries(response.job_board_entries))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to refresh your applications");
      });
  }, [refreshTrigger]);

  // Search, tags and the rejected/archived toggles; the status chips apply on top, in the list.
  const listedEntries = useMemo(
    () =>
      filteredEntries
        .filter(
          (e) =>
            (showRejected || e.status !== JobStatus.REJECTED) && (showArchived || e.status !== JobStatus.ARCHIVED)
        )
        .map((e) => ({ e, added: new Date(e.created_at).getTime() }))
        .sort((a, b) => b.added - a.added)
        .map(({ e }) => e),
    [filteredEntries, showRejected, showArchived]
  );

  // One status at a time; a status hidden by the toggles no longer filters.
  const status = statusFilter.find((s) => listedEntries.some((e) => e.status === s)) ?? null;
  const shownEntries = useMemo(
    () => (status ? listedEntries.filter((e) => e.status === status) : listedEntries),
    [listedEntries, status]
  );

  const shownIds = useMemo(() => shownEntries.map((e) => e.id), [shownEntries]);
  // On wide screens something is always selected, so the pane is never empty.
  const selected =
    shownEntries.find((e) => e.id === jobId) ?? (isWide && jobId === null ? shownEntries[0] : undefined);

  // The list as last shown, to find the selected job's neighbour once it's gone.
  const previousIdsRef = useRef<number[]>([]);
  useEffect(() => {
    if (isLoading || jobId === null || shownIds.includes(jobId)) return;
    // On phones the panel has closed; clear the address too, so Back doesn't return to it.
    if (!isWide) {
      closeJob();
      return;
    }
    // Filtered out, rejected or deleted: select the job next to it.
    const next = neighbourId(previousIdsRef.current, jobId, shownIds);
    if (next !== null) openJob(next, { replace: true });
    else closeJob();
  }, [isWide, isLoading, jobId, shownIds, openJob, closeJob]);
  useEffect(() => {
    previousIdsRef.current = shownIds;
  }, [shownIds]);

  const { notes, addNote } = useNotes(selected?.id);
  const onPatchJob = usePatchJob(setJobBoardEntries);

  const handleSelect = useCallback(
    (entry: JobBoardEntry) => openJob(entry.id, { replace: isWide }),
    [openJob, isWide]
  );

  const openAddJob = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setAddMounted(true);
    setIsAddOpen(true);
  };

  const closeAddJob = () => {
    setIsAddOpen(false);
    closeTimeoutRef.current = setTimeout(() => setAddMounted(false), 300);
  };

  useEffect(() => () => void (closeTimeoutRef.current && clearTimeout(closeTimeoutRef.current)), []);

  // The job's fields, edited in place; they save by themselves, also when another job is picked.
  const detail = (entry: JobBoardEntry, headerAction?: ReactNode) => (
    <JobFormSheet
      // One form per job: its fields start from the job, so a reused form would save them onto another.
      key={entry.id}
      mode="edit"
      layout="pane"
      entry={entry}
      allEntries={jobBoardEntries}
      // Rejecting, archiving or deleting closes the phone panel; on wide screens the next job is selected.
      onClose={() => !isWide && closeJob()}
      onPrepare={() => router.push(`/board/${entry.id}?from=applications`)}
      onPatchJob={onPatchJob}
      onDelete={(gone) => setJobBoardEntries((prev) => prev.filter((e) => e.id !== gone.id))}
      notes={notes[entry.id] ?? []}
      notesLoading={notes[entry.id] === undefined}
      onNoteAdded={(note) => addNote(entry.id, note)}
      headerAction={headerAction}
    />
  );

  return (
    <>
      <div className="mx-auto flex w-full min-w-0 max-w-[1536px] flex-1 flex-col px-4 pb-8 pt-4 sm:px-6 sm:pt-10 lg:min-h-0 lg:px-10">
        <JobsHeader title="Applications" description="What you sent, and to whom" onAddJob={openAddJob}>
          <BoardFilters
            jobBoardEntries={jobBoardEntries}
            searchInput={searchInput}
            onSearchChange={handleSearchChange}
            tags={tags}
            onTagToggle={handleTagToggle}
            onClearTags={handleClearTags}
            showRejected={showRejected}
            onToggleRejected={handleToggleRejected}
            showArchived={showArchived}
            onToggleArchived={handleToggleArchived}
          />
        </JobsHeader>

        <div className="mt-4 grid min-w-0 overflow-hidden rounded-xl border bg-background sm:mt-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(380px,45%)] xl:grid-cols-[minmax(0,1fr)_minmax(460px,46%)]">
          <SentList
            entries={listedEntries}
            status={status}
            onStatusChange={(s) => setStatusFilter(s ? [s] : [])}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
            isLoading={isLoading}
            isEmpty={isEmpty}
          />

          {isWide && (
            <aside aria-label="Selected application" aria-live="polite" className="min-h-0 overflow-y-auto border-l bg-muted/30">
              {selected ? (
                detail(selected)
              ) : (
                !isLoading &&
                jobId === null && (
                  <p className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
                    Pick an application to see what you sent.
                  </p>
                )
              )}
            </aside>
          )}
        </div>
      </div>

      {/* On phones the selected job opens over the list. */}
      {!isWide && (
        <Sheet open={selected !== undefined} onOpenChange={(open) => !open && closeJob()}>
          <SheetContent showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
            <VisuallyHidden.Root>
              <SheetTitle>{selected ? `${selected.title} at ${selected.company}` : "Application"}</SheetTitle>
            </VisuallyHidden.Root>
            {selected &&
              detail(
                selected,
                <Button type="button" variant="ghost" size="icon-sm" onClick={closeJob} aria-label="Close">
                  <XIcon />
                </Button>
              )}
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={isAddOpen} onOpenChange={(open) => !open && closeAddJob()}>
        {addMounted && (
          <JobFormSheet
            mode="create"
            entry={null}
            allEntries={jobBoardEntries}
            onClose={closeAddJob}
            onAddJob={(job) => {
              setJobBoardEntries((prev) => [...prev, job]);
              // A status chip hiding the new job would leave it out of sight.
              if (status && job.status !== status) setStatusFilter([]);
              openJob(job.id, { replace: isWide });
            }}
          />
        )}
      </Sheet>

    </>
  );
};

// Reading the selected job from the address needs a boundary to prerender the page.
const ApplicationsPage = () => (
  <Suspense>
    <ApplicationsPageContent />
  </Suspense>
);

export default ApplicationsPage;
