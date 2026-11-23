"use client";

import FitBadge from "@/components/common/FitBadge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { readiness } from "@/lib/jobBoard/readiness";
import { useJobTailoring } from "@/lib/jobBoard/useJobTailoring";
import { CvTailoringReport, JobBoardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, CircleDashedIcon, Loader2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import DocSlot from "./DocSlot";
import JobCvPreview from "./JobCvPreview";

interface JobSendProps {
  entry: JobBoardEntry;
  onPatchEntry: (id: number, patch: EntryPatch) => void;
  /** Saves the job's details first, then runs the action. */
  beforeLeave: (action: () => void) => void;
  /** Shown between the cover letter and the CV itself. */
  children?: ReactNode;
}

const COVERAGE_ICONS = { yes: CheckIcon, partly: CircleDashedIcon, no: XIcon } as const;
const COVERAGE_STYLES = { yes: "text-emerald-700", partly: "text-amber-700", no: "text-rose-700" } as const;

/** What the job asks for, and whether the CV shows it. */
const Requirements = ({ requirements }: Pick<CvTailoringReport, "requirements">) => (
  <div className="space-y-2">
    <p className="text-sm text-muted-foreground">
      Shows {requirements.filter((item) => item.covered === "yes").length} of the {requirements.length} things they ask for
    </p>
    <ul className="space-y-1.5">
      {requirements.map(({ text, covered }) => {
        const Icon = COVERAGE_ICONS[covered];
        return (
          <li key={text} className="flex min-w-0 items-start gap-2 text-sm">
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", COVERAGE_STYLES[covered])}
              aria-hidden
            />
            <span className={cn("min-w-0 break-words", covered !== "yes" && "text-muted-foreground")}>
              {text}
              {covered === "partly" && ", not clear yet"}
              {covered === "no" && ", missing"}
            </span>
          </li>
        );
      })}
    </ul>
  </div>
);

/** What goes to the employer: the CV and how it covers what they ask, and the cover letter. */
const JobSend = ({ entry, onPatchEntry, beforeLeave, children }: JobSendProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const { tailoring, starting, error, start } = useJobTailoring(entry, onPatchEntry);

  // Null once the job has been applied to.
  const ready = readiness(entry, user?.reviews_available ?? true);
  const copy = entry.cv_curriculum;
  const requirements = tailoring?.status === "succeeded" ? tailoring.report?.requirements ?? [] : [];

  const nextForCv = () => {
    switch (ready?.state) {
      case "suggestions":
        return (
          <Button
            type="button"
            size="sm"
            variant="candido"
            onClick={() => beforeLeave(() => router.push(`/resume/${copy!.id}`))}
          >
            Review {copy!.pending_suggestions} {copy!.pending_suggestions === 1 ? "suggestion" : "suggestions"}
          </Button>
        );
      case "reviewing":
        return (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Reviewing…
          </span>
        );
      case "not_reviewed":
      case "failed":
        return (
          // The review reads the job, so its latest details are saved first.
          <Button type="button" size="sm" variant="candido" onClick={() => beforeLeave(() => void start())} disabled={starting}>
            {starting ? "Starting…" : ready.state === "failed" ? "Try again" : "Tailor this CV"}
          </Button>
        );
      default:
        return undefined;
    }
  };

  const problem = error ?? (ready?.state === "failed" ? tailoring?.error_message || "The review didn't finish." : null);

  return (
    <>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Your application</h2>
        {copy?.fit && <FitBadge fit={copy.fit} />}
      </div>

      <div className="space-y-4">
        {ready?.state === "no_cv" && (
          <p className="text-sm text-muted-foreground">
            Copy one of your CVs for this job and get edits that help it fit. Your original isn&apos;t changed.
          </p>
        )}
        {ready?.state === "not_reviewed" && (
          <p className="text-sm text-muted-foreground">
            See how your CV fits, and get suggested edits. It and this job are sent to Anthropic&apos;s Claude.
          </p>
        )}
        <DocSlot
          kind="cv"
          entry={entry}
          onPatchEntry={onPatchEntry}
          beforeLeave={beforeLeave}
          isNext={ready?.state === "no_cv"}
          next={nextForCv()}
        />
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {requirements.length > 0 && <Requirements requirements={requirements} />}
      </div>

      <div className="border-t border-border pt-4">
        <DocSlot kind="cover_letter" entry={entry} onPatchEntry={onPatchEntry} />
      </div>
      {children && <div className="border-t border-border pt-4">{children}</div>}
      {copy && <JobCvPreview curriculumId={copy.id} updatedAt={copy.updated_at} />}
    </>
  );
};

export default JobSend;
