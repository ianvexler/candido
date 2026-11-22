"use client";

import Loader from "@/components/common/Loader";
import { Button } from "@/components/ui/Button";
import { COVERAGE_LABELS, FIT_LABELS, FIT_STYLES, progressStep, reviewGroups, sectionLabel } from "@/lib/resume/reviewPanel";
import { isTailoringActive } from "@/lib/resume/suggestions";
import { CurriculumSection, CvSuggestion, CvTailoring } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronRightIcon, ContrastIcon, InfoIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import SuggestionRow, { DoneRow } from "./SuggestionRow";

interface ReviewPanelProps {
  tailoring: CvTailoring | null;
  sections: CurriculumSection[];
  staleIds: Set<number>;
  activeId: number | null;
  onSelect: (id: number) => void;
  /** Marks a stale suggestion or a note as rejected. */
  onDismiss: (s: CvSuggestion) => Promise<void>;
  onRerun: () => void;
  rerunning: boolean;
  /** The job behind this copy was deleted, so it can't be reviewed again. */
  jobRemoved: boolean;
  /** The job has a posting URL, so not reading it is worth mentioning. */
  jobHasUrl?: boolean;
  /** Company of the job, for the empty state of a copy that hasn't been reviewed. */
  company?: string | null;
  /** Shown inline above the footer, e.g. why a re-run couldn't start. */
  error?: string | null;
}

const COVERAGE_ICONS = {
  yes: <CheckIcon className="size-3 text-emerald-600" aria-hidden />,
  partly: <ContrastIcon className="size-3 text-amber-600" aria-hidden />,
  no: <XIcon className="size-3 text-rose-600" aria-hidden />,
};

const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2 text-xs font-medium text-muted-foreground">{children}</h3>
);

/** Rotates the cosmetic progress copy every few seconds; remounts per run. */
const ReviewProgress = () => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Loader size="sm" message={progressStep(tick)} />
      <p className="text-xs text-muted-foreground">Takes a minute or two. You can keep editing.</p>
    </div>
  );
};

/** The latest review of a tailored resume: fit, requirements, gaps and suggestions. */
const ReviewPanel = ({
  tailoring,
  sections,
  staleIds,
  activeId,
  onSelect,
  onDismiss,
  onRerun,
  rerunning,
  jobRemoved,
  jobHasUrl = false,
  company,
  error,
}: ReviewPanelProps) => {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [dismissing, setDismissing] = useState<number[]>([]);

  const sectionsById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const groups = useMemo(
    () => reviewGroups(tailoring?.suggestions ?? [], staleIds, new Set(sectionsById.keys())),
    [tailoring, staleIds, sectionsById]
  );
  const labelOf = (s: CvSuggestion) => sectionLabel(sectionsById.get(s.curriculum_section_id));

  const dismiss = async (s: CvSuggestion) => {
    setDismissing((ids) => [...ids, s.id]);
    try {
      await onDismiss(s);
    } finally {
      setDismissing((ids) => ids.filter((id) => id !== s.id));
    }
  };

  const active = isTailoringActive(tailoring);
  const report = tailoring?.status === "succeeded" ? tailoring.report : null;

  const footer = jobRemoved ? (
    <p className="text-xs text-muted-foreground">This job was removed from your board.</p>
  ) : (
    tailoring &&
    !active &&
    tailoring.status !== "failed" && (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" size="sm" onClick={onRerun} disabled={rerunning}>
          <RotateCcwIcon className={cn(rerunning && "animate-spin [animation-direction:reverse]")} />
          Re-run review
        </Button>
        {groups.left > 0 && <span className="text-xs text-muted-foreground">Open suggestions are replaced.</span>}
      </div>
    )
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6 px-5 py-5">
        {tailoring && (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-sm font-semibold leading-snug break-words">
                {tailoring.job_title} · {tailoring.company}
              </h2>
              {report && (
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    FIT_STYLES[report.fit]
                  )}
                >
                  <i className="size-1.5 rounded-full" aria-hidden />
                  {FIT_LABELS[report.fit]}
                  <span className="sr-only"> fit</span>
                </span>
              )}
            </div>

            {report?.summary && (
              <button
                type="button"
                onClick={() => setSummaryOpen((open) => !open)}
                aria-expanded={summaryOpen}
                className={cn(
                  "block w-full text-left text-sm text-muted-foreground",
                  !summaryOpen && "line-clamp-2"
                )}
              >
                {report.summary}
              </button>
            )}

            {report && !tailoring.used_posting && jobHasUrl && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <InfoIcon className="mt-px size-3 shrink-0" aria-hidden />
                Couldn&apos;t open the posting; reviewed from the saved description.
              </p>
            )}
          </div>
        )}

        {!tailoring && !jobRemoved && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {company ? `Get suggestions to fit this CV to the ${company} job.` : "Get suggestions to fit this CV to the job."}
            </p>
            <Button type="button" size="sm" onClick={onRerun} disabled={rerunning}>
              {rerunning ? "Starting review…" : "Review against this job"}
            </Button>
          </div>
        )}

        {active && <ReviewProgress key={tailoring?.id} />}

        {tailoring?.status === "failed" && (
          <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm">{tailoring.error_message || "The review didn't finish."}</p>
            {!jobRemoved && (
              <Button type="button" size="sm" variant="outline" onClick={onRerun} disabled={rerunning}>
                <RotateCcwIcon />
                Try again
              </Button>
            )}
          </div>
        )}

        {report && report.requirements.length > 0 && (
          <section>
            <Heading>Requirements</Heading>
            <ul className="flex flex-wrap gap-1.5">
              {report.requirements.map((requirement, index) => (
                <li
                  key={index}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                  title={`${COVERAGE_LABELS[requirement.covered]}: ${requirement.text}`}
                >
                  {COVERAGE_ICONS[requirement.covered]}
                  <span className="sr-only">{COVERAGE_LABELS[requirement.covered]}: </span>
                  <span className="truncate">{requirement.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {report && report.gaps.length > 0 && (
          <section>
            <Heading>Gaps</Heading>
            <ul className="list-disc space-y-1 pl-4 text-sm marker:text-muted-foreground">
              {report.gaps.map((gap, index) => (
                <li key={index}>{gap}</li>
              ))}
            </ul>
          </section>
        )}

        {report && (
          <section>
            <Heading>
              Suggestions <span className="font-normal">· {groups.left} left</span>
            </Heading>
            {groups.left === 0 ? (
              <p className="text-sm text-muted-foreground">
                {groups.done.length > 0 ? "All done." : "No changes suggested."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {[...groups.open, ...groups.stale].map((s) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    label={labelOf(s)}
                    stale={staleIds.has(s.id)}
                    active={s.id === activeId}
                    dismissing={dismissing.includes(s.id)}
                    onSelect={() => onSelect(s.id)}
                    onDismiss={() => void dismiss(s)}
                  />
                ))}
              </ul>
            )}

            {groups.done.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setDoneOpen((open) => !open)}
                  aria-expanded={doneOpen}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", doneOpen && "rotate-90")} />
                  Done ({groups.done.length})
                </button>
                {doneOpen && (
                  <ul className="mt-1">
                    {groups.done.map((s) => (
                      <DoneRow key={s.id} suggestion={s} label={labelOf(s)} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {footer && <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3">{footer}</div>}
    </div>
  );
};

export default ReviewPanel;
