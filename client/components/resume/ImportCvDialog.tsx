"use client";

import { applyCvImport, ApplyCvImportResponse } from "@/api/resources/cvImports/applyCvImport";
import { createCvImport } from "@/api/resources/cvImports/createCvImport";
import { getCvImport } from "@/api/resources/cvImports/getCvImport";
import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { pollUntil, PollTimeoutError } from "@/lib/poll";
import { buildResumeDocument, ExportSection } from "@/lib/resume/exportDocument";
import { waitForSaves } from "@/lib/resume/saveTracker";
import { CvImport, ResumeHeader } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FileUpIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_SIZE = 5 * 1024 * 1024;
const POLL_INTERVAL_MS = 2000;
// Longer than the server can spend on one read (two 150s attempts), so the
// dialog never gives up on an import that then finishes and is billed.
const POLL_TIMEOUT_MS = 6 * 60 * 1000;

type Step =
  | { name: "choose" }
  | { name: "reading"; filename: string }
  | { name: "review"; cvImport: CvImport }
  | { name: "failed"; message: string };

interface ImportCvDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied: (result: ApplyCvImportResponse) => void;
  /** Also makes a CV from the added sections, instead of only filling the library. */
  createCv?: boolean;
}

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const headerSummary = (header: ResumeHeader) =>
  [header.name, header.headline, header.email, header.phone, header.location].filter(Boolean);

/** Upload a CV, wait while it's read, then choose what to add to the library. */
const ImportCvDialog = ({ open, onClose, onApplied, createCv = false }: ImportCvDialogProps) => {
  const [step, setStep] = useState<Step>({ name: "choose" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fillProfile, setFillProfile] = useState(true);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const pollAbort = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => pollAbort.current?.abort(), []);

  const reset = () => {
    pollAbort.current?.abort();
    setStep({ name: "choose" });
    setSelected(new Set());
    setFillProfile(true);
    setApplyError(null);
  };

  const close = () => {
    if (applying) return;
    reset();
    onClose();
  };

  const startImport = async (file: File) => {
    if (file.size > MAX_SIZE) {
      setStep({ name: "failed", message: "That file is over 5 MB." });
      return;
    }

    setStep({ name: "reading", filename: file.name });
    pollAbort.current?.abort();
    const controller = new AbortController();
    pollAbort.current = controller;

    try {
      const { cv_import: created } = await createCvImport(file, controller.signal);
      const finished = await pollUntil(
        async () => (await getCvImport(created.id)).cv_import,
        (cvImport) => cvImport.status === "succeeded" || cvImport.status === "failed",
        { intervalMs: POLL_INTERVAL_MS, timeoutMs: POLL_TIMEOUT_MS, signal: controller.signal }
      );

      if (controller.signal.aborted) return;
      if (finished.status === "failed" || !finished.result) {
        setStep({ name: "failed", message: finished.error_message ?? "We couldn't read this CV." });
        return;
      }
      setSelected(new Set(finished.result.sections.flatMap((section) => section.entries.map((entry) => entry.id))));
      setFillProfile(headerSummary(finished.result.header).length > 0 || finished.result.header.links.length > 0);
      setStep({ name: "review", cvImport: finished });
    } catch (error) {
      // The dialog was closed or another file was chosen: this result is stale.
      if (controller.signal.aborted) return;
      const message =
        error instanceof PollTimeoutError
          ? "This is taking longer than expected. Try again later."
          : errorMessage(error, "We couldn't upload this file. Try again.");
      setStep({ name: "failed", message });
    }
  };

  const onFileChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void startImport(file);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void startImport(file);
  };

  const apply = async () => {
    if (step.name !== "review") return;
    setApplying(true);
    setApplyError(null);
    try {
      // The import merges into the saved profile, so header edits still
      // waiting to save must land first or the reloaded header drops them.
      if (!(await waitForSaves())) {
        setApplyError("Your profile is still saving. Try again in a moment.");
        return;
      }
      const result = await applyCvImport(step.cvImport.id, {
        entry_ids: [...selected],
        fill_profile: fillProfile,
        create_cv: createCv,
      });
      onApplied(result);
      reset();
      onClose();
    } catch (error) {
      // Stay on the review so the user can retry without reading the CV again.
      setApplyError(errorMessage(error, "We couldn't add these sections. Try again."));
    } finally {
      setApplying(false);
    }
  };

  const sectionCount =
    step.name === "review"
      ? (step.cvImport.result?.sections ?? []).filter((section) => section.entries.some((entry) => selected.has(entry.id))).length
      : 0;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-100 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-101 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-background p-6 shadow-lg">
          <Dialog.Title asChild>
            <h2 className="text-lg font-semibold">Import from CV</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1 text-sm text-muted-foreground">
              {step.name === "review"
                ? "Choose what to add. Nothing you've already written is overwritten."
                : "Upload your current CV and we'll turn it into sections you can edit."}
            </p>
          </Dialog.Description>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            {step.name === "choose" && (
              <>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center transition-colors hover:bg-muted/50",
                    dragging && "border-foreground/40 bg-muted/60"
                  )}
                >
                  <FileUpIcon className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Choose a PDF or Word file</span>
                  <span className="text-xs text-muted-foreground">or drop it here · up to 5 MB</span>
                </button>
                <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={onFileChosen} />
                <p className="mt-3 text-xs text-muted-foreground">
                  Your CV is sent to Anthropic&apos;s Claude to read it. We don&apos;t keep the file.
                </p>
              </>
            )}

            {step.name === "reading" && (
              <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
                <Loader />
                <p className="text-sm font-medium">Reading {step.filename}…</p>
                <p className="text-xs text-muted-foreground">This usually takes under a minute.</p>
              </div>
            )}

            {step.name === "failed" && (
              <div className="py-8 text-center" role="alert">
                <p className="text-sm font-medium">{step.message}</p>
              </div>
            )}

            {step.name === "review" && step.cvImport.result && (
              <ReviewList
                cvImport={step.cvImport}
                selected={selected}
                onToggle={(entryIds, checked) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    entryIds.forEach((entryId) => (checked ? next.add(entryId) : next.delete(entryId)));
                    return next;
                  })
                }
                fillProfile={fillProfile}
                onFillProfile={setFillProfile}
              />
            )}
            {step.name === "review" && applyError && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {applyError}
              </p>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            {step.name === "failed" ? (
              <>
                <Button type="button" variant="outline" onClick={close}>
                  Close
                </Button>
                <Button type="button" onClick={reset}>
                  Try another file
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={close} disabled={applying}>
                  Cancel
                </Button>
                {step.name === "review" && (
                  <Button
                    type="button"
                    onClick={() => void apply()}
                    disabled={applying || (selected.size === 0 && !fillProfile)}
                  >
                    {sectionCount > 0
                      ? `Add ${sectionCount} ${sectionCount === 1 ? "section" : "sections"}`
                      : "Fill profile"}
                  </Button>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

interface ReviewListProps {
  cvImport: CvImport;
  /** Entry ids. */
  selected: Set<string>;
  onToggle: (entryIds: string[], checked: boolean) => void;
  fillProfile: boolean;
  onFillProfile: (checked: boolean) => void;
}

const ReviewList = ({ cvImport, selected, onToggle, fillProfile, onFillProfile }: ReviewListProps) => {
  const result = cvImport.result!;
  // Reuse the export model to show each entry's details line; section ids are draft indexes.
  const preview = useMemo(
    () =>
      buildResumeDocument({
        title: "Import",
        header: result.header,
        sections: result.sections.map((section, index) => ({ ...section, id: index })),
      }),
    [result]
  );
  const headerValues = headerSummary(preview.header);
  const hasHeader = headerValues.length > 0 || preview.header.links.length > 0;

  return (
    <div className="space-y-4">
      {hasHeader && (
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-4 py-3 hover:bg-muted/40">
          <Checkbox className="mt-0.5" checked={fillProfile} onCheckedChange={(checked) => onFillProfile(checked === true)} />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">Fill empty profile fields</span>
            <span className="block truncate text-muted-foreground">
              {[...headerValues, ...preview.header.links.map((link) => link.label || link.url)].join(" · ")}
            </span>
          </span>
        </label>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {preview.sections.map((section) => (
          <ReviewSection key={section.id} section={section} selected={selected} onToggle={onToggle} />
        ))}
      </ul>
    </div>
  );
};

interface ReviewSectionProps extends Pick<ReviewListProps, "selected" | "onToggle"> {
  section: ExportSection;
}

/** A section to tick as a whole, with its entries listed below it when there are titles to show. */
const ReviewSection = ({ section, selected, onToggle }: ReviewSectionProps) => {
  const entryIds = section.entries.map((entry) => entry.id);
  const count = entryIds.filter((id) => selected.has(id)).length;
  const isPlain = section.entries.length === 1 && !section.entries[0].title && !section.entries[0].subtitle;

  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/40">
        <Checkbox
          checked={count === 0 ? false : count === entryIds.length ? true : "indeterminate"}
          onCheckedChange={(checked) => onToggle(entryIds, checked === true)}
        />
        <span className="min-w-0 flex-1 text-sm font-medium">{section.heading}</span>
        {section.entries.length > 1 && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {count === entryIds.length ? `${count} entries` : `${count} of ${entryIds.length} entries`}
          </span>
        )}
      </label>
      {!isPlain && (
        <ul className="pb-2">
          {section.entries.map((entry) => (
            <li key={entry.id}>
              <label className="flex cursor-pointer items-start gap-3 py-1.5 pl-11 pr-4 hover:bg-muted/40">
                <Checkbox
                  className="mt-0.5"
                  checked={selected.has(entry.id)}
                  onCheckedChange={(checked) => onToggle([entry.id], checked === true)}
                />
                <span className="min-w-0 text-sm">
                  <span className="block">{entry.title || entry.subtitle || "Untitled"}</span>
                  {(entry.subtitle || entry.meta) && (
                    <span className="block truncate text-muted-foreground">
                      {[entry.title ? entry.subtitle : "", entry.meta].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export default ImportCvDialog;
