"use client";

import Loader from "@/components/common/Loader";
import { closingLabel, sentDocuments, statusCounts } from "@/lib/jobBoard/sentLog";
import Restock from "@/lib/images/Restock.png";
import Spy from "@/lib/images/Spy.png";
import { JobBoardEntry, JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { format } from "date-fns";
import { FileTextIcon, FileUserIcon } from "lucide-react";
import Image from "next/image";
import { KeyboardEvent, useEffect, useRef } from "react";

interface SentListProps {
  /** Before the status chips are applied, so the chips can count them. */
  entries: JobBoardEntry[];
  status: JobStatus | null;
  onStatusChange: (status: JobStatus | null) => void;
  selectedId: number | null;
  onSelect: (entry: JobBoardEntry) => void;
  isLoading: boolean;
  /** The user has no jobs at all, rather than none matching. */
  isEmpty: boolean;
}

export const statusLabel = (status: JobStatus) => capitalize(status.toLowerCase());

/** The applications, one row each: the job, where it stands, what went with it, and when. */
const SentList = ({ entries, status, onStatusChange, selectedId, onSelect, isLoading, isEmpty }: SentListProps) => {
  const counts = statusCounts(entries);
  const rows = status ? entries.filter((e) => e.status === status) : entries;
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());

  // A job picked from the address, or after the previous one left, is scrolled into view.
  useEffect(() => {
    if (selectedId !== null) rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const moveSelection = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const index = rows.findIndex((row) => row.id === selectedId);
    const next = rows[e.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)];
    if (next) {
      onSelect(next);
      rowRefs.current.get(next.id)?.focus();
    }
  };

  return (
    <div className="@container flex min-h-0 min-w-0 flex-col">
      {counts.length > 0 && (
        <div role="group" aria-label="Show only one status" className="flex flex-wrap gap-2 border-b px-4 py-3 @xl:px-5">
          <Chip pressed={status === null} onClick={() => onStatusChange(null)} label="All" count={entries.length} />
          {counts.map(({ status: s, count }) => (
            <Chip
              key={s}
              pressed={status === s}
              onClick={() => onStatusChange(status === s ? null : s)}
              label={statusLabel(s)}
              count={count}
              dot={jobStatusColors[s]}
            />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
          {isLoading ? (
            <Loader />
          ) : (
            <>
              <Image src={isEmpty ? Restock : Spy} alt="" width={180} height={180} />
              <p className="text-base text-muted-foreground">
                {isEmpty
                  ? "Nothing sent yet. Add the first job you've applied for, or import your spreadsheet."
                  : "No applications match your filters."}
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,1fr)_120px_64px_76px] gap-3 border-b px-5 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground @xl:grid"
          >
            <span className="pl-5">Job</span>
            <span>Status</span>
            <span>Sent</span>
            <span className="text-right">Added</span>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto" onKeyDown={moveSelection}>
            {rows.map((entry) => (
              <li key={entry.id}>
                <Row
                  entry={entry}
                  selected={entry.id === selectedId}
                  onSelect={() => onSelect(entry)}
                  ref={(node) => {
                    if (node) rowRefs.current.set(entry.id, node);
                    else rowRefs.current.delete(entry.id);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

const Chip = ({
  pressed,
  onClick,
  label,
  count,
  dot,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className={cn(
      "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
      pressed ? "bg-candido-black text-white" : "bg-muted hover:bg-muted-foreground/15"
    )}
  >
    {dot && <i className={cn("size-2 rounded-full", dot)} aria-hidden />}
    {label}
    <span className={cn("tabular-nums", pressed ? "text-white/70" : "text-muted-foreground")}>{count}</span>
  </button>
);

const Row = ({
  entry,
  selected,
  onSelect,
  ref,
}: {
  entry: JobBoardEntry;
  selected: boolean;
  onSelect: () => void;
  ref: (node: HTMLButtonElement | null) => void;
}) => {
  const sent = sentDocuments(entry);
  const closing = entry.status === JobStatus.PENDING ? closingLabel(entry.closing_date) : null;

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b px-4 py-3.5 text-left text-sm outline-none transition-colors @xl:grid-cols-[minmax(0,1fr)_120px_64px_76px] @xl:px-5",
        "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50",
        selected ? "bg-candido/20" : "hover:bg-muted/60"
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-candido" />}

      <span className="flex min-w-0 items-start gap-3">
        <i className={cn("mt-1.5 size-2 shrink-0 rounded-full", jobStatusColors[entry.status])} aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-semibold" title={entry.title}>
            {entry.title}
          </span>
          <span className="block truncate text-muted-foreground" title={entry.company}>
            {entry.company}
            {entry.location && ` · ${entry.location}`}
          </span>
        </span>
      </span>

      <span className="text-right text-muted-foreground @xl:text-left @xl:text-foreground">
        {statusLabel(entry.status)}
        <span className="block text-xs text-muted-foreground">
          {closing ?? <span className="tabular-nums @xl:hidden">{format(new Date(entry.created_at), "d MMM")}</span>}
        </span>
      </span>

      <span className="hidden items-center gap-1.5 @xl:flex">
        <SentMark present={sent.cv} label="CV" icon={<FileUserIcon />} />
        <SentMark present={sent.coverLetter} label="Cover letter" icon={<FileTextIcon />} />
      </span>

      <span className="hidden text-right tabular-nums text-muted-foreground @xl:block">
        {format(new Date(entry.created_at), "d MMM")}
      </span>
    </button>
  );
};

/** One document's mark: solid when it's on the job, faint when it isn't. */
const SentMark = ({ present, label, icon }: { present: boolean; label: string; icon: React.ReactNode }) => (
  <span
    title={`${label}: ${present ? "attached" : "none yet"}`}
    className={cn("[&_svg]:size-4", present ? "text-foreground" : "text-muted-foreground/35")}
  >
    {icon}
    <span className="sr-only">{`${label}: ${present ? "attached" : "none yet"}`}</span>
  </span>
);

export default SentList;
