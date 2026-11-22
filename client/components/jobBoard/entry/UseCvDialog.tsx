"use client";

import { getCurriculums } from "@/api/resources/curriculums/getCurriculums";
import { createCvTailoring } from "@/api/resources/cvTailorings/createCvTailoring";
import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { isReviewUnavailable } from "@/lib/jobBoard/cvSlot";
import { splitCurriculums } from "@/lib/resume/curriculumGroups";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { Curriculum, CvTailoring, JobBoardEntry } from "@/lib/types";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";

export type UseCvResult = { curriculum: Curriculum; cv_tailoring: CvTailoring | null };

interface UseCvDialogProps {
  open: boolean;
  onClose: () => void;
  entry: JobBoardEntry;
  onCreated: (result: UseCvResult) => void;
}

/** Pick a master CV to copy for this job, optionally reviewed against it. */
const UseCvDialog = ({ open, onClose, entry, onCreated }: UseCvDialogProps) => {
  const router = useRouter();
  const [masters, setMasters] = useState<Curriculum[] | null>(null);
  const [review, setReview] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void getCurriculums()
      .then((response) => {
        if (!cancelled) setMasters(splitCurriculums(response.curriculums).masters);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setLoadFailed(true);
          setError("Failed to load your CVs.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = () => {
    if (pendingId !== null) return;
    setMasters(null);
    setReview(true);
    setError(null);
    setLoadFailed(false);
    onClose();
  };

  const choose = async (curriculum: Curriculum) => {
    if (pendingId !== null) return;
    setPendingId(curriculum.id);
    setError(null);
    try {
      const result = await createCvTailoring(entry.id, curriculum.id, { review });
      onCreated(result);
      router.push(`/resume/${result.curriculum.id}`);
    } catch (err) {
      console.error(err);
      setError(apiErrorMessage(err, "Couldn't copy the CV. Try again."));
      // Nothing was made; untick so the next pick makes a plain copy.
      if (review && isReviewUnavailable(err)) setReview(false);
      setPendingId(null);
    }
  };

  const busy = pendingId !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title asChild>
            <h2 className="text-lg font-semibold">Use one of my CVs</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll make a copy for {entry.company}.
            </p>
          </Dialog.Description>

          {!loadFailed && (
            <div className="mt-4 min-h-0 overflow-y-auto rounded-md border border-border">
              {masters === null ? (
                <div className="flex justify-center py-8">
                  <Loader />
                </div>
              ) : masters.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  You don&apos;t have any CVs yet.{" "}
                  <Link href="/resume" className="font-medium text-foreground underline underline-offset-4">
                    Create one
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {masters.map((curriculum) => (
                    <li key={curriculum.id}>
                      <button
                        type="button"
                        onClick={() => void choose(curriculum)}
                        disabled={busy}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{curriculum.title}</span>
                        {pendingId === curriculum.id ? (
                          <Loader2Icon className="size-4 shrink-0 animate-spin" />
                        ) : (
                          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {!loadFailed && masters?.length !== 0 && (
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={review}
                  onCheckedChange={(checked) => setReview(checked === true)}
                  disabled={busy}
                />
                Review it against this job
              </label>
              {review && (
                <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                  Your CV and this job are sent to Anthropic. Your original CV isn&apos;t changed.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default UseCvDialog;
