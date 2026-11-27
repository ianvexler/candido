"use client";

import { createCurriculum } from "@/api/resources/curriculums/createCurriculum";
import { getSectionTemplates } from "@/api/resources/sectionTemplates/getSectionTemplates";
import { Button } from "@/components/ui/Button";
import { purposeCounts } from "@/lib/resume/purposes";
import { CvLabel, SectionTemplate } from "@/lib/types";
import { Loader2Icon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useMemo, useState } from "react";

/** Makes a CV of the whole library for a purpose (null: Everything), and the page to open it at, ready to rename. */
export const createCvFor = async (labelId: number | null): Promise<string> => {
  const response = await createCurriculum({ whole_library: true, cv_label_id: labelId });
  return `/resume/${response.curriculum.id}?rename=1`;
};

const itemsLabel = (count: number | undefined) =>
  count === undefined ? null : `${count} ${count === 1 ? "item" : "items"}`;

interface NewCvDialogProps {
  labels: CvLabel[];
  /** Resolves false if the CV couldn't be made, so another can be picked. */
  onPick: (labelId: number | null) => Promise<boolean>;
  onClose: () => void;
}

/** Asks what a new CV is for. Mount it only while in use, so each opening starts fresh. */
const NewCvDialog = ({ labels, onPick, onClose }: NewCvDialogProps) => {
  const [templates, setTemplates] = useState<SectionTemplate[] | null>(null);
  const [picked, setPicked] = useState<number | "all" | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Only for the counts: without them, it can still be picked.
    getSectionTemplates()
      .then((response) => {
        if (!cancelled) setTemplates(response.section_templates);
      })
      .catch((error) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => (templates ? purposeCounts(templates, labels) : null), [templates, labels]);
  const busy = picked !== null;

  const pick = async (labelId: number | null) => {
    setPicked(labelId ?? "all");
    if (!(await onPick(labelId))) setPicked(null);
  };

  const options: { key: number | "all"; labelId: number | null; name: string }[] = [
    { key: "all", labelId: null, name: "All content" },
    ...labels.map((label) => ({ key: label.id, labelId: label.id, name: label.name })),
  ];

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">New CV</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Start from a collection: the CV ticks what is in it. You can change this later.
          </Dialog.Description>

          <ul className="mt-4 min-h-0 divide-y divide-border overflow-y-auto border-y border-border">
            {options.map(({ key, labelId, name }) => (
              <li key={key}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(labelId)}
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-3 text-left hover:bg-muted/50 disabled:opacity-60"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{name}</span>
                  {picked === key ? (
                    <Loader2Icon className="size-4 shrink-0 animate-spin" aria-label="Creating" />
                  ) : (
                    <span className="shrink-0 text-sm text-muted-foreground">{itemsLabel(counts?.get(key))}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default NewCvDialog;
