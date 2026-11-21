"use client";

import { getCurriculums } from "@/api/resources/curriculums/getCurriculums";
import { createCvTailoring } from "@/api/resources/cvTailorings/createCvTailoring";
import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { Curriculum, JobBoardEntry } from "@/lib/types";
import { apiErrorMessage } from "@/lib/resume/reviewPanel";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";

interface TailorCvDialogProps {
  open: boolean;
  onClose: () => void;
  entry: JobBoardEntry;
}

/** Pick a CV to copy and review against this job. */
const TailorCvDialog = ({ open, onClose, entry }: TailorCvDialogProps) => {
  const router = useRouter();
  const [curriculums, setCurriculums] = useState<Curriculum[] | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void getCurriculums()
      .then((response) => {
        if (!cancelled) setCurriculums(response.curriculums);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setCurriculums([]);
          setError("Failed to load your CVs.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = () => {
    if (pendingId !== null) return;
    setCurriculums(null);
    setError(null);
    onClose();
  };

  const choose = async (curriculum: Curriculum) => {
    if (pendingId !== null) return;
    setPendingId(curriculum.id);
    setError(null);
    try {
      const response = await createCvTailoring(entry.id, curriculum.id);
      router.push(`/resume/${response.curriculum.id}`);
    } catch (err) {
      console.error(err);
      setError(apiErrorMessage(err, "Couldn't start tailoring. Try again."));
      setPendingId(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title asChild>
            <h2 className="text-lg font-semibold">Tailor a CV</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a CV to copy for {entry.company}.
            </p>
          </Dialog.Description>

          <div className="mt-4 min-h-0 overflow-y-auto rounded-md border border-border">
            {curriculums === null ? (
              <div className="flex justify-center py-8">
                <Loader />
              </div>
            ) : curriculums.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">You don&apos;t have any CVs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {curriculums.map((curriculum) => (
                  <li key={curriculum.id}>
                    <button
                      type="button"
                      onClick={() => void choose(curriculum)}
                      disabled={pendingId !== null}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{curriculum.title}</span>
                        {curriculum.tailored_for && (
                          <span className="block truncate text-xs text-muted-foreground">
                            For {curriculum.tailored_for}
                          </span>
                        )}
                      </span>
                      {pendingId === curriculum.id && <Loader2Icon className="size-4 shrink-0 animate-spin" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Your CV and this job are sent to Anthropic to review. Your original CV isn&apos;t changed.
          </p>

          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" onClick={close} disabled={pendingId !== null}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TailorCvDialog;
