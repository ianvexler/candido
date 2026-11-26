"use client";

import { deleteJobBoardEntry } from "@/api/resources/jobBoardEntries/deleteJobBoardEntry";
import { updateJobBoardEntry } from "@/api/resources/jobBoardEntries/updateJobBoardEntry";
import { getJobBoardEntries } from "@/api/resources/jobBoardEntries/getJobBoardEntries";
import JobBoardColumn from "@/components/jobBoard/JobBoardColumn";
import {
  ActionDropZones,
  ACTION_DROPPABLE_IDS,
  ACCEPTED_DROPPABLE_ID,
  DELETE_DROPPABLE_ID,
  ARCHIVE_DROPPABLE_ID,
  REJECTED_DROPPABLE_ID,
} from "@/components/jobBoard/ActionDropZones";
import { JobBoardEntry, JobStatus } from "@/lib/types";
import { useBoardFilters } from "@/hooks/useBoardFilters";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { usePatchJob } from "@/lib/jobBoard/usePatchJob";
import { usePublishJobCounts } from "@/lib/jobBoard/useJobCounts";
import { useOpenJob } from "@/lib/jobBoard/useOpenJob";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Sheet } from "@/components/ui/Sheet";
import JobSheet from "@/components/jobBoard/JobSheet";
import JobFormSheet from "@/components/jobBoard/JobFormSheet";
import JobsHeader from "@/components/jobBoard/JobsHeader";
import BoardFilters from "@/components/jobBoard/BoardFilters";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { useJobsRefresh } from "@/contexts/JobsRefreshContext";

const BoardPageContent = () => {
  const { jobId, openJob, closeJob } = useOpenJob();
  const { refreshTrigger } = useJobsRefresh();
  const [jobBoardEntries, setJobBoardEntries] = useState<JobBoardEntry[]>([]);
  usePublishJobCounts(jobBoardEntries);
  const [openAddJobModal, setOpenAddJobModal] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFromOffered, setDraggedFromOffered] = useState(false);
  const [draggedEntryOriginalStatus, setDraggedEntryOriginalStatus] = useState<Record<number, JobStatus>>();
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<JobBoardEntry | null>(null);

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
    filteredEntries,
  } = useBoardFilters("board", jobBoardEntries, setJobBoardEntries);

  const snapshotRef = useRef<JobBoardEntry[]>([]);
  const latestEntriesRef = useRef<JobBoardEntry[]>([]);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    void getJobBoardEntries()
      .then((response) => {
        setJobBoardEntries(response.job_board_entries);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to get job board entries");
      });
    
    return () => {
      initializedRef.current = false;
    };
  }, [showArchived, showRejected]);

  useEffect(() => {
    if (refreshTrigger === 0) {
      return;
    }
  
    void getJobBoardEntries()
      .then((response) => setJobBoardEntries(response.job_board_entries))
      .catch((error) => {
        console.error(error);
        toast.error("Failed to refresh job board");
      });
  }, [refreshTrigger]);

  const showAccepted = useMemo(() => {
    const hasAcceptedEntries = jobBoardEntries.some((e) => e.status === JobStatus.ACCEPTED);
    
    const isDraggingFromAccepted =
      isDragging &&
      draggedEntryOriginalStatus &&
      Object.values(draggedEntryOriginalStatus).includes(JobStatus.ACCEPTED);
    
      return hasAcceptedEntries || isDraggingFromAccepted;
  }, [jobBoardEntries, isDragging, draggedEntryOriginalStatus]);

  const onAddJob = (job: JobBoardEntry) => {
    setJobBoardEntries((prev) => [...prev, job]);
  };

  const handleUpdateEntry = async (
    entry: JobBoardEntry,
    newStatus: JobStatus,
    newNumber: number
  ) => {
    try {
      await updateJobBoardEntry(
        entry.id,
        entry.title,
        entry.company,
        entry.location ?? "",
        entry.salary ?? "",
        entry.url ?? "",
        entry.description ?? "",
        newStatus,
        newNumber
      );
    } catch (error) {
      console.error(error);
      toast.error(`Failed to update ${entry.title}`);
      setJobBoardEntries([...snapshotRef.current]);
    }
  };

  const groupEntriesByStatus = (entries: JobBoardEntry[]): Record<JobStatus, JobBoardEntry[]> => {
    const grouped = {} as Record<JobStatus, JobBoardEntry[]>;
    for (const status of Object.values(JobStatus)) {
      grouped[status] = entries
        .filter((e) => e.status === status)
        .sort((a, b) => a.number - b.number);
    }
    return grouped;
  };
  
  const flattenWithUpdates = (grouped: Record<JobStatus, JobBoardEntry[]>): JobBoardEntry[] => {
    const result: JobBoardEntry[] = [];
    for (const [status, entries] of Object.entries(grouped)) {
      entries.forEach((entry, i) => {
        result.push({ ...entry, status: status as JobStatus, number: i + 1 });
      });
    }

    return result;
  };

  const handleSelectJob = (job: JobBoardEntry) => openJob(job.id);

  const onPatchJob = usePatchJob(setJobBoardEntries);

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      setIsSheetOpen(false);

      closeTimeoutRef.current = setTimeout(() => {
        setOpenAddJobModal(false);
        closeTimeoutRef.current = null;
      }, 300);
    }
  };

  useEffect(() => () => { if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current); }, []);

  const handleDeleteDrop = (entry: JobBoardEntry) => {
    setPendingDeleteEntry(entry);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteEntry) {
      return;
    }
    const entry = pendingDeleteEntry;
    setPendingDeleteEntry(null);

    try {
      await deleteJobBoardEntry(entry.id);
      setJobBoardEntries((prev) => prev.filter((e) => e.id !== entry.id));
      
      toast.success(`Deleted ${entry.title}`);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to delete ${entry.title}`);
    }
  };

  const handleArchiveDrop = (entry: JobBoardEntry) => {
    const archivedCount = jobBoardEntries.filter((e) => e.status === JobStatus.ARCHIVED).length;
    const newNumber = archivedCount + 1;

    setJobBoardEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: JobStatus.ARCHIVED, number: newNumber } : e))
    );
    void handleUpdateEntry(entry, JobStatus.ARCHIVED, newNumber);
  };

  const handleRejectedDrop = (entry: JobBoardEntry) => {
    const rejectedCount = jobBoardEntries.filter((e) => e.status === JobStatus.REJECTED).length;
    const newNumber = rejectedCount + 1;

    setJobBoardEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: JobStatus.REJECTED, number: newNumber } : e))
    );
    void handleUpdateEntry(entry, JobStatus.REJECTED, newNumber);
  };

  const handleAcceptedDrop = (entry: JobBoardEntry) => {
    const acceptedCount = jobBoardEntries.filter((e) => e.status === JobStatus.ACCEPTED).length;
    const newNumber = acceptedCount + 1;

    setJobBoardEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: JobStatus.ACCEPTED, number: newNumber } : e))
    );
    void handleUpdateEntry(entry, JobStatus.ACCEPTED, newNumber);
  };

  const handleDragStart = (
    event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragStart"]>>[0]
  ) => {
    setIsDragging(true);
    snapshotRef.current = [...jobBoardEntries];
    const source = event.operation?.source;
    const group = source && "group" in source ? source.group : undefined;

    setDraggedFromOffered(group === JobStatus.OFFERED);
    const originalEntry = snapshotRef.current.find((e) => e.id === source?.id);

    setDraggedEntryOriginalStatus(originalEntry ? { [originalEntry.id]: originalEntry.status } : undefined);
  };

  const handleDragOver = (event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragOver"]>>[0]) => {
    const { source, target } = event.operation;
    if (source?.type === "column") {
      return;
    }
    if (target?.id && ACTION_DROPPABLE_IDS.includes(target.id as (typeof ACTION_DROPPABLE_IDS)[number])) {
      return;
    }

    setJobBoardEntries((entries) => {
      const grouped = groupEntriesByStatus(entries);
      const movedGrouped = move(grouped, event);
      const result = flattenWithUpdates(movedGrouped);
      latestEntriesRef.current = result;
      return result;
    });
  };

  const handleDragEnd = (event: Parameters<NonNullable<React.ComponentProps<typeof DragDropProvider>["onDragEnd"]>>[0]) => {
    setIsDragging(false);
    setDraggedFromOffered(false);
    setDraggedEntryOriginalStatus(undefined);
  
    if (event.canceled) {
      setJobBoardEntries(snapshotRef.current);
      return;
    }

    const { source, target } = event.operation;
    const entry = snapshotRef.current.find((e) => e.id === source?.id);

    if (target?.id && entry) {
      if (target.id === DELETE_DROPPABLE_ID) {
        handleDeleteDrop(entry);
        return;
      }
      if (target.id === ARCHIVE_DROPPABLE_ID) {
        handleArchiveDrop(entry);
        return;
      }
      if (target.id === REJECTED_DROPPABLE_ID) {
        handleRejectedDrop(entry);
        return;
      }
      if (target.id === ACCEPTED_DROPPABLE_ID) {
        handleAcceptedDrop(entry);
        return;
      }
    }

    if (!isSortable(source)) {
      return;
    }

    const { index, group } = source;
    if (!group || !Object.values(JobStatus).includes(group as JobStatus)) {
      return;
    }

    if (index < 0) {
      return;
    }

    const newStatus = group as JobStatus;
    const movedEntry = latestEntriesRef.current.find((e) => e.id === source.id);

    if (movedEntry) {
      void handleUpdateEntry(movedEntry, newStatus, index);
    }
  };

  const openAddJob = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setOpenAddJobModal(true);
    setIsSheetOpen(true);
  };

  return (
    <>
      <div className="w-full px-4 sm:px-6 lg:px-10 pt-4 sm:pt-10 pb-8 flex flex-col min-h-0 flex-1 overflow-hidden">
        <JobsHeader title="Board" description="Track your job applications" onAddJob={openAddJob}>
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

        <DragDropProvider
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 min-h-0 flex flex-col mt-4 sm:mt-8">
            <div className="flex-1 min-h-0 overflow-auto pb-5">
              <div className="flex justify-start items-stretch divide-x divide-border [&>div]:px-4 sm:[&>div]:px-6 [&>div]:first:pl-0 [&>div]:last:pr-0 px-1 min-w-max">
                {Object.values(JobStatus).map((status: JobStatus) => {
                  if (!showRejected && status === JobStatus.REJECTED) {
                    return null;
                  }
                  if (!showArchived && status === JobStatus.ARCHIVED) {
                    return null;
                  }
                  if (!showAccepted && status === JobStatus.ACCEPTED) {
                    return null;
                  }

                  return (
                    <JobBoardColumn
                      key={status}
                      status={status}
                      entries={filteredEntries
                        .filter((e) => e.status === status)
                        .sort((a, b) => a.number - b.number)}
                      onSelectJob={handleSelectJob}
                      draggedEntryOriginalStatus={draggedEntryOriginalStatus}
                    />
                  );
                })}
              </div>
            </div>

            {isDragging && <ActionDropZones showAcceptedZone={draggedFromOffered} />}
          </div>
        </DragDropProvider>
      </div>

      <ConfirmationModal
        isOpen={!!pendingDeleteEntry}
        onClose={() => setPendingDeleteEntry(null)}
        onConfirm={confirmDelete}
        title="Delete job?"
        description={
          pendingDeleteEntry
            ? `Are you sure you want to delete "${pendingDeleteEntry.title}" at ${pendingDeleteEntry.company}? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
      />

      <Sheet open={isSheetOpen} onOpenChange={handleSheetOpenChange}>
        {openAddJobModal && (
          <JobFormSheet
            allEntries={jobBoardEntries}
            onClose={() => handleSheetOpenChange(false)}
            onAddJob={onAddJob}
          />
        )}
      </Sheet>

      <JobSheet
        entry={jobBoardEntries.find((entry) => entry.id === jobId)}
        allEntries={jobBoardEntries}
        from="board"
        onClose={closeJob}
        onPatchJob={onPatchJob}
        onDelete={(entry) => setJobBoardEntries((prev) => prev.filter((e) => e.id !== entry.id))}
      />
    </>
  );
};

// Reading the open job from the address needs a boundary to prerender the page.
const BoardPage = () => (
  <Suspense>
    <BoardPageContent />
  </Suspense>
);

export default BoardPage;
