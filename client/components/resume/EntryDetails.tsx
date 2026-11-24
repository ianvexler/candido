"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { organizationLabel } from "@/lib/resume/exportDocument";
import { endsBeforeStart } from "@/lib/resume/sectionEntries";
import { SectionEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { formatDateRange, fromMonthInput, hasDetails, toMonthInput } from "./sectionDetails";
import { ghostInput } from "./styles";
import { useOpenWhileFocused } from "./useOpenWhileFocused";

export type DetailField = "role" | "organization" | "dates" | "location";

interface EntryDetailsProps {
  entry: SectionEntry;
  onChange: (changes: Partial<SectionEntry>) => void;
  /** Shows the fields even with nothing filled in, as a new entry does. */
  offered: boolean;
  /** Set to open the fields with the focus in the role; cleared by onOpened. */
  openRequested: boolean;
  onOpened: () => void;
}

/** An entry's role, dates and place: reads as in the CV, and shows all its fields while being edited. */
const EntryDetails = ({ entry, onChange, offered, openRequested, onOpened }: EntryDetailsProps) => {
  // Kept as typed: a half-typed month isn't a date yet.
  const [startMonth, setStartMonth] = useState(toMonthInput(entry.start_date));
  const [endMonth, setEndMonth] = useState(toMonthInput(entry.end_date));
  // What the browser's own picker has half of, which its value doesn't tell.
  const [halfPicked, setHalfPicked] = useState({ start: false, end: false });
  const { open, setOpen, focusProps } = useOpenWhileFocused();
  const rowRef = useRef<HTMLDivElement>(null);
  const focusField = useRef<DetailField | null>(null);

  const edit = (field: DetailField) => {
    focusField.current = field;
    setOpen(true);
  };

  useEffect(() => {
    if (!openRequested) return;
    onOpened();
    const role = rowRef.current?.querySelector<HTMLInputElement>('[data-field="role"]');
    if (role) return role.focus();
    focusField.current = "role";
    setOpen(true);
  }, [openRequested, onOpened, setOpen]);

  useEffect(() => {
    if (!open || !focusField.current) return;
    rowRef.current?.querySelector<HTMLInputElement>(`[data-field="${focusField.current}"]`)?.focus();
    focusField.current = null;
  }, [open]);

  const endBeforeStart = endsBeforeStart(entry);
  const filled = hasDetails(entry);
  const isUnfinished = (month: string, picked: boolean) => picked || (month !== "" && fromMonthInput(month) === null);
  const unfinished =
    isUnfinished(startMonth, halfPicked.start) || (!entry.current && isUnfinished(endMonth, halfPicked.end));
  if (!open && !filled && !offered && !unfinished) return null;

  const row = "mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 text-sm";

  if (!open && filled && !endBeforeStart && !unfinished) {
    const role = entry.role?.trim();
    const dates = formatDateRange(entry);
    const location = entry.location?.trim();
    // As exported, unless there would be nothing to click.
    const organization = organizationLabel(entry)?.trim() || (!role && !dates && !location && entry.organization?.trim());
    const piece = (field: DetailField, text: string, label: string, className?: string) => (
      <button
        type="button"
        onClick={() => edit(field)}
        aria-label={`Edit ${label}: ${text}`}
        className={cn(ghostInput, "mx-0 cursor-text px-0 py-0.5 text-left wrap-anywhere focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        {text}
      </button>
    );
    const dot = <span aria-hidden className="text-muted-foreground"> · </span>;

    return (
      <div ref={rowRef} className={row}>
        {(role || organization) && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-medium">
            {role && piece("role", role, "role")}
            {role && organization && dot}
            {organization && piece("organization", organization, "organisation")}
          </div>
        )}
        {(dates || location) && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-muted-foreground">
            {dates && piece("dates", dates, "dates")}
            {dates && location && dot}
            {location && piece("location", location, "location")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rowRef} className={row} {...focusProps}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <input
          data-field="role"
          value={entry.role ?? ""}
          onChange={(event) => onChange({ role: event.target.value })}
          placeholder="Role or degree"
          aria-label="Role or degree"
          className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5 font-medium")}
        />
        <span aria-hidden className="text-muted-foreground/60">at</span>
        <input
          data-field="organization"
          value={entry.organization ?? ""}
          onChange={(event) => onChange({ organization: event.target.value })}
          placeholder="Organisation"
          aria-label="Organisation or school"
          className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
        />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
        <input
          data-field="dates"
          type="month"
          value={startMonth}
          onChange={(event) => {
            setStartMonth(event.target.value);
            onChange({ start_date: fromMonthInput(event.target.value) });
          }}
          onBlur={({ target }) => setHalfPicked((now) => ({ ...now, start: target.validity.badInput }))}
          aria-label="Start month"
          className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5")}
        />
        <span aria-hidden>–</span>
        {entry.current ? (
          <span className="px-1 py-0.5 text-foreground">Present</span>
        ) : (
          <input
            type="month"
            value={endMonth}
            min={startMonth || undefined}
            onChange={(event) => {
              setEndMonth(event.target.value);
              onChange({ end_date: fromMonthInput(event.target.value) });
            }}
            onBlur={({ target }) => setHalfPicked((now) => ({ ...now, end: target.validity.badInput }))}
            aria-label="End month"
            aria-invalid={endBeforeStart || undefined}
            className={cn(ghostInput, "cv-month w-[9.75rem] py-0.5", endBeforeStart && "text-destructive")}
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={entry.current}
              // Safari doesn't focus a pressed button, which would close the fields.
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                // The end month, which may have the focus, goes.
                event.currentTarget.focus();
                onChange({ current: !entry.current });
              }}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                entry.current
                  ? "border-transparent bg-muted text-foreground"
                  : "border-dashed border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Current
            </button>
          </TooltipTrigger>
          <TooltipContent>{entry.current ? "Set an end date instead" : "Still here? Show the end date as Present"}</TooltipContent>
        </Tooltip>
        <input
          data-field="location"
          value={entry.location ?? ""}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Location"
          aria-label="Location"
          className={cn(ghostInput, "field-sizing-content min-w-[7ch] py-0.5")}
        />
      </div>
      {!open && unfinished && (
        <p role="alert" className="w-full text-xs text-destructive">
          A month isn&apos;t complete, so it isn&apos;t saved. Write it like 2022-03.
        </p>
      )}
      {endBeforeStart && (
        <p role="alert" className="w-full text-xs text-destructive">
          The end month is before the start month, so this isn&apos;t saved yet.
        </p>
      )}
    </div>
  );
};

export default EntryDetails;
