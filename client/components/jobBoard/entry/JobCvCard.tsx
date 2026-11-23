"use client";

import FitBadge from "@/components/common/FitBadge";
import { Button } from "@/components/ui/Button";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { Readiness } from "@/lib/jobBoard/readiness";
import { COVERAGE_LABELS } from "@/lib/resume/reviewPanel";
import { CvTailoring, CvTailoringReport, JobBoardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, CircleDashedIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import Link from "next/link";
import DocSlot from "./DocSlot";
import JobPanel from "./JobPanel";

interface JobCvCardProps {
  entry: JobBoardEntry;
  /** Null once the job has been applied to: the card then only shows the CV that was used. */
  readiness: Readiness | null;
  /** The CV's latest review, once loaded. */
  tailoring: CvTailoring | null;
  starting: boolean;
  error: string | null;
  onReview: () => void;
  onPatchEntry: (id: number, patch: EntryPatch) => void;
}

const COVERAGE_ICONS = { yes: CheckIcon, partly: CircleDashedIcon, no: XIcon } as const;
const COVERAGE_STYLES = { yes: "text-emerald-700", partly: "text-amber-700", no: "text-rose-700" } as const;

const Requirements = ({ requirements }: Pick<CvTailoringReport, "requirements">) => {
  const covered = requirements.filter((item) => item.covered === "yes").length;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Shows {covered} of the {requirements.length} things they ask for.
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {requirements.map(({ text, covered: coverage }) => {
          const Icon = COVERAGE_ICONS[coverage];
          return (
            <li key={text} className="flex min-w-0 items-start gap-2 text-sm">
              <Icon
                className={cn("mt-0.5 size-4 shrink-0", COVERAGE_STYLES[coverage])}
                role="img"
                aria-label={COVERAGE_LABELS[coverage]}
              />
              <span className={cn("min-w-0 break-words", coverage !== "yes" && "text-muted-foreground")}>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** The job's CV: how it fits, the one next thing to do with it, and the document itself. */
const JobCvCard = ({ entry, readiness, tailoring, starting, error, onReview, onPatchEntry }: JobCvCardProps) => {
  const copy = entry.cv_curriculum;
  const requirements = tailoring?.status === "succeeded" ? tailoring.report?.requirements ?? [] : [];

  const next = () => {
    switch (readiness?.state) {
      case "suggestions":
        return (
          <Button asChild variant="candido">
            <Link href={`/resume/${copy!.id}`}>
              Review {copy!.pending_suggestions} {copy!.pending_suggestions === 1 ? "suggestion" : "suggestions"}
            </Link>
          </Button>
        );
      case "reviewing":
        return (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Comparing your CV with this job. You can leave this page.
          </p>
        );
      case "not_reviewed":
      case "failed":
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {readiness.state === "failed"
                ? tailoring?.error_message || "The review didn't finish."
                : "See how it fits, and get suggested edits. Your CV and this job are sent to Anthropic's Claude."}
            </p>
            <Button type="button" variant="candido" onClick={onReview} disabled={starting}>
              <SparklesIcon />
              {starting ? "Starting…" : readiness.state === "failed" ? "Try again" : "Tailor this CV"}
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <JobPanel
      title={readiness ? `Your CV for ${entry.company}` : "CV you used"}
      aside={copy?.fit && <FitBadge fit={copy.fit} />}
    >
      {requirements.length > 0 && <Requirements requirements={requirements} />}
      {next()}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DocSlot key={entry.id} kind="cv" entry={entry} onPatchEntry={onPatchEntry} />
    </JobPanel>
  );
};

export default JobCvCard;
