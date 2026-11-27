import { CalendarCheckIcon } from "lucide-react";
import PanelEmpty from "./PanelEmpty";
import Link from "next/link";
import { closingLabel } from "@/lib/dashboard/chart";
import { ClosingJob } from "@/lib/types";
import { differenceInCalendarDays, format } from "date-fns";
import { cn } from "@/lib/utils";

interface ClosingSoonProps {
  jobs: ClosingJob[];
  total: number;
}

const ClosingSoon = ({ jobs, total }: ClosingSoonProps) => {
  if (jobs.length === 0) {
    return (
      <PanelEmpty icon={CalendarCheckIcon} title="Nothing closing in the next two weeks">
        Jobs with a closing date that you haven&apos;t applied to yet will show up here.
      </PanelEmpty>
    );
  }

  return (
    <>
      <ul className="-mx-2">
        {jobs.map((job) => {
          const closingDate = new Date(job.closing_date);
          const isUrgent = differenceInCalendarDays(closingDate, new Date()) <= 2;

          return (
            <li key={job.id}>
              <Link href={`/board?job=${job.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-candido-ink leading-none">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-candido">{format(closingDate, "MMM")}</span>
                  <span className="mt-0.5 font-heading text-lg font-black text-white">{format(closingDate, "d")}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{job.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{job.company}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    isUrgent ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"
                  )}
                >
                  {closingLabel(job.closing_date)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {total > jobs.length && (
        <p className="mt-2 text-xs text-muted-foreground">and {total - jobs.length} more</p>
      )}
    </>
  );
};

export default ClosingSoon;
