"use client";

import { getJobBoardEntry } from "@/api/resources/jobBoardEntries/getJobBoardEntry";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import MainEntryForm from "@/components/jobBoard/entry/MainEntryForm";
import { JobBoardEntry } from "@/lib/types";
import { use, useCallback, useEffect, useRef, useState } from "react";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import EntryDocArea from "@/components/jobBoard/entry/EntryDocArea";

interface BoardJobEntryPageProps {
  params: Promise<{ id: string }>;
}

const BoardJobEntry = ({ params }: BoardJobEntryPageProps) => {
  const { id } = use(params);
  const [jobEntry, setJobEntry] = useState<JobBoardEntry>();

  useEffect(() => {
    let cancelled = false;

    getJobBoardEntry(id).then((response) => {
      if (!cancelled) {
        setJobEntry(response.job_board_entry);
      }
    });
    return () => { cancelled = true; };
  }, [id]);
  
  const onFileUpdate = (entry: JobBoardEntry) => {
    setJobEntry(entry);
  }

  // The form saves only on Submit, so ask before the CV slot leaves the page with edits unsaved.
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const beforeLeave = (action: () => void) => {
    if (dirtyRef.current) setPendingLeave(() => action);
    else action();
  };

  if (!jobEntry) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <PageContainer>
      <div className="grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-4 w-full mt-3 min-w-0">
        <div className="min-w-0">
          <MainEntryForm
            entry={jobEntry}
            onUpdateEntry={setJobEntry}
            onDirtyChange={onDirtyChange}
          />
        </div>

        <div className="min-w-0 overflow-hidden">
          <EntryDocArea 
            entry={jobEntry} 
            onUpdateEntry={onFileUpdate}
            beforeLeave={beforeLeave}
          />
        </div>
      </div>

      <ConfirmationModal
        isOpen={pendingLeave !== null}
        onClose={() => setPendingLeave(null)}
        onConfirm={() => pendingLeave?.()}
        title="Discard your job changes?"
        description="You have edits to this job that aren't submitted yet."
        confirmLabel="Discard and continue"
        cancelLabel="Keep editing"
        variant="destructive"
      />
    </PageContainer>
  )
}

export default BoardJobEntry;