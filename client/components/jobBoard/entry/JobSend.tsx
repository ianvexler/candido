"use client";

import FitBadge from "@/components/common/FitBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { coverLetterSlotState, EntryPatch } from "@/lib/jobBoard/docSlot";
import { readiness } from "@/lib/jobBoard/readiness";
import { useJobTailoring } from "@/lib/jobBoard/useJobTailoring";
import { CvTailoringReport, JobBoardEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckIcon, CircleDashedIcon, Loader2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import DocSlot from "./DocSlot";
import JobCvPreview from "./JobCvPreview";

interface JobSendProps {
  entry: JobBoardEntry;
  onPatchEntry: (id: number, patch: EntryPatch) => void;
  /** Saves the job's details first, then runs the action. */
  beforeLeave: (action: () => void) => void;
}

const COVERAGE_ICONS = { yes: CheckIcon, partly: CircleDashedIcon, no: XIcon } as const;
const COVERAGE_STYLES = { yes: "text-emerald-700", partly: "text-amber-700", no: "text-rose-700" } as const;

/** What the job asks for, and whether the CV shows it. */
const Requirements = ({ requirements }: Pick<CvTailoringReport, "requirements">) => (
  <div className="space-y-3">
    <p className="font-medium">
      Shows {requirements.filter((item) => item.covered === "yes").length} of the {requirements.length} things they ask for
    </p>
    <ul className="space-y-2">
      {requirements.map(({ text, covered }, index) => {
        const Icon = COVERAGE_ICONS[covered];
        return (
          <li key={index} className="flex min-w-0 items-start gap-2.5">
            <Icon
              className={cn("mt-1 size-4 shrink-0", COVERAGE_STYLES[covered])}
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
const JobSend = ({ entry, onPatchEntry, beforeLeave }: JobSendProps) => {
  const router = useRouter();
  const { user } = useAuth();
  const { tailoring, starting, error, start } = useJobTailoring(entry, onPatchEntry);

  // Null once the job has been applied to.
  const ready = readiness(entry, user?.reviews_available ?? true);
  const copy = entry.cv_curriculum;
  const letter = coverLetterSlotState(entry);
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
    <Tabs defaultValue="cv" className="gap-6">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Your application</h2>
        <TabsList>
          <TabsTrigger value="cv" className="px-4">CV</TabsTrigger>
          <TabsTrigger value="cover_letter" className="px-4">Cover letter</TabsTrigger>
        </TabsList>
      </div>

      {/* Kept mounted, so switching tabs doesn't lose a half-typed document. */}
      <TabsContent value="cv" forceMount className="space-y-6 data-[state=inactive]:hidden">
        <DocSlot
          kind="cv"
          titled
          badge={copy?.fit && <FitBadge fit={copy.fit} />}
          entry={entry}
          onPatchEntry={onPatchEntry}
          beforeLeave={beforeLeave}
          isNext={ready?.state === "no_cv"}
          next={nextForCv()}
        />
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
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {requirements.length > 0 && <Requirements requirements={requirements} />}
        {copy && <JobCvPreview curriculumId={copy.id} updatedAt={copy.updated_at} />}
      </TabsContent>

      <TabsContent value="cover_letter" forceMount className="space-y-6 data-[state=inactive]:hidden">
        <DocSlot kind="cover_letter" titled entry={entry} onPatchEntry={onPatchEntry} />
        {ready && letter === "empty" && (
          <p className="text-sm text-muted-foreground">Optional. Add the letter you want to send with your CV.</p>
        )}
        {letter === "text" && (
          <div className="rounded-sm bg-white px-6 py-6 text-sm leading-relaxed break-words whitespace-pre-line shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-8">
            {entry.cover_letter_text}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default JobSend;
