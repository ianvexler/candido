"use client";

import FitBadge from "@/components/common/FitBadge";
import DocSlot from "@/components/jobBoard/entry/DocSlot";
import NotesArea from "@/components/jobBoard/NotesArea";
import { Button } from "@/components/ui/Button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { useAuth } from "@/contexts/AuthContext";
import { EntryPatch } from "@/lib/jobBoard/docSlot";
import { postingUrl, prepareAction, readiness } from "@/lib/jobBoard/readiness";
import { closingLabel, descriptionText, STATUS_ORDER } from "@/lib/jobBoard/sentLog";
import { JobBoardEntry, JobStatus, jobStatusColors, Note } from "@/lib/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ArrowUpRightIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { ReactNode, useState } from "react";
import { statusLabel } from "./SentList";

interface SentDetailProps {
  entry: JobBoardEntry;
  onStatusChange: (entry: JobBoardEntry, status: JobStatus) => void;
  onPatchJob: (id: number, patch: EntryPatch) => void;
  onEdit: () => void;
  notes: Note[] | undefined;
  onNoteAdded: (note: Note) => void;
  /** Shown at the top right, e.g. a close button in the phone panel. */
  close?: ReactNode;
}

/**
 * Everything about one application at a glance: where it stands, what was sent, and the notes.
 * Its parent must remount it for another job (key it by the job's id), so a half-typed
 * document or note never carries over.
 */
const SentDetail = ({ entry, onStatusChange, onPatchJob, onEdit, notes, onNoteAdded, close }: SentDetailProps) => {
  const { user } = useAuth();
  const ready = readiness(entry, user?.reviews_available ?? true);
  const prepare = prepareAction(ready);
  const posting = postingUrl(entry.url);
  const closing = closingLabel(entry.closing_date);
  const fit = entry.cv_curriculum?.fit;
  const tags = entry.job_board_tags ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-5 sm:px-7 sm:pt-6">
        <Select value={entry.status} onValueChange={(v) => onStatusChange(entry, v as JobStatus)}>
          <SelectTrigger size="sm" className="w-auto gap-2 rounded-full" aria-label="Status">
            <i className={cn("size-2 rounded-full", jobStatusColors[entry.status])} aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectGroup>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            <PencilIcon />
            Edit
          </Button>
          {close}
        </div>
      </div>

      <div className="px-5 pb-6 pt-4 sm:px-7">
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{entry.title}</h2>
        <p className="mt-1 text-muted-foreground">
          {[entry.company, entry.location, entry.salary].filter((part) => part?.trim()).join(" · ")}
        </p>
        {posting && (
          <a
            href={posting}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            View posting
            <ArrowUpRightIcon className="size-4" />
          </a>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border text-sm">
          <Fact label="Added">{format(new Date(entry.created_at), "d MMM yyyy")}</Fact>
          <Fact label="Closing date">
            {entry.closing_date ? (
              <>
                {format(new Date(entry.closing_date), "d MMM yyyy")}
                {entry.status === JobStatus.PENDING && closing && (
                  <span className="block text-xs text-muted-foreground">{closing}</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </Fact>
        </dl>

        <Section
          title={entry.status === JobStatus.PENDING ? "What you'll send" : "What you sent"}
          aside={fit ? <FitBadge fit={fit} /> : null}
        >
          <div className="divide-y rounded-lg border [&>*]:px-4 [&>*]:py-3">
            <DocSlot kind="cv" entry={entry} onPatchEntry={onPatchJob} />
            <DocSlot kind="cover_letter" entry={entry} onPatchEntry={onPatchJob} />
          </div>
          <Button
            asChild
            size="sm"
            variant={ready && ready.state !== "no_cv" ? "candido" : "outline"}
            className="mt-3 w-full sm:w-auto"
          >
            <Link href={`/board/${entry.id}?from=applications`}>
              {prepare.label}
              <ArrowUpRightIcon />
            </Link>
          </Button>
        </Section>

        <Section title="Notes">
          <NotesArea jobBoardEntry={entry} notes={notes ?? []} loading={notes === undefined} onNoteAdded={onNoteAdded} />
        </Section>

        <JobDescription html={entry.description} />

        {tags.length > 0 && (
          <Section title="Tags">
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {tag.name}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="bg-background px-4 py-3">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 font-medium">{children}</dd>
  </div>
);

const Section = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="mt-7">
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

/** The posting's text, a few lines at first: enough to remind you what the job was. */
const JobDescription = ({ html }: { html: string }) => {
  const [expanded, setExpanded] = useState(false);
  const text = descriptionText(html);
  if (!text) return null;
  const long = text.length > 360 || text.split("\n").length > 6;

  return (
    <Section title="Job description">
      <p className={cn("whitespace-pre-line text-sm leading-relaxed", !expanded && long && "line-clamp-6")}>{text}</p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 cursor-pointer text-sm font-medium underline-offset-4 hover:underline"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
    </Section>
  );
};

export default SentDetail;
