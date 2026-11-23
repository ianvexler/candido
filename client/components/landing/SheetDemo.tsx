"use client";

import { JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { FileTextIcon, StickyNoteIcon } from "lucide-react";
import { useState } from "react";

const ROWS = [
  { title: "Product Designer", company: "Fernway", status: JobStatus.INTERVIEW, closing: "12 Mar", cv: "CV for Fernway", letter: "Fernway letter.pdf", note: "Second call is with the research lead. Ask how the team splits discovery work." },
  { title: "Data Analyst", company: "Tidemark Energy", status: JobStatus.APPLIED, closing: "18 Mar", cv: "CV for Tidemark", letter: "Tidemark letter.pdf", note: "Applied through the careers page. Nia on the data team offered a referral." },
  { title: "Support Lead", company: "Oakline", status: JobStatus.APPLIED, closing: "20 Mar", cv: "Main CV", letter: null, note: "Four-day week. Salary is in the posting." },
  { title: "Frontend Engineer", company: "Pebble & Co", status: JobStatus.OFFERED, closing: "2 Mar", cv: "CV for Pebble", letter: "Pebble letter.pdf", note: "Offer is in. Reply by Friday." },
];

const FILTERS = [null, JobStatus.APPLIED, JobStatus.INTERVIEW, JobStatus.OFFERED] as const;

const label = (status: JobStatus) => capitalize(status.toLowerCase());

/** A filterable sheet, with the selected application's documents and notes. */
const SheetDemo = () => {
  const [filter, setFilter] = useState<JobStatus | null>(null);
  const [selected, setSelected] = useState(ROWS[0]);

  const rows = ROWS.filter((row) => !filter || row.status === filter);

  const changeFilter = (status: JobStatus | null) => {
    setFilter(status);
    const first = ROWS.find((row) => !status || row.status === status);
    if (first) setSelected(first);
  };

  return (
    <div className="grid overflow-hidden rounded-2xl bg-white lg:grid-cols-[1.6fr_1fr]">
      <div className="p-4 sm:p-7">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {FILTERS.map((status) => (
            <button
              key={status ?? "all"}
              type="button"
              aria-pressed={filter === status}
              onClick={() => changeFilter(status)}
              className={cn(
                "min-h-10 cursor-pointer rounded-full px-4 text-[15px] font-medium",
                filter === status ? "bg-candido-black text-white" : "bg-neutral-100 hover:bg-neutral-200"
              )}
            >
              {status ? label(status) : "All"}
            </button>
          ))}
        </div>

        <div className="mt-5 lg:min-h-[310px]">
          {rows.map((row) => (
            <button
              key={row.company}
              type="button"
              aria-pressed={selected.company === row.company}
              onClick={() => setSelected(row)}
              className={cn(
                "grid w-full cursor-pointer grid-cols-[1fr_auto] items-center gap-3 border-b px-3 py-4 text-left text-[15px] sm:grid-cols-[1fr_120px_70px]",
                selected.company === row.company ? "bg-[#fff0d2]" : "hover:bg-neutral-50"
              )}
            >
              <span>
                <span className="block font-semibold">{row.title}</span>
                <span className="text-neutral-600">{row.company}</span>
              </span>
              <span className="flex items-center gap-2">
                <i className={cn("size-2.5 rounded-full", jobStatusColors[row.status])} aria-hidden />
                {label(row.status)}
              </span>
              <span className="hidden text-neutral-600 sm:block">{row.closing}</span>
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="border-t bg-[#fafafa] p-6 text-[15px] sm:p-9 lg:border-l lg:border-t-0">
        <p className="text-[24px] font-bold leading-tight">{selected.title}</p>
        <p className="mt-1 text-neutral-600">{selected.company}</p>
        <p className="mt-1 text-neutral-600">Closes {selected.closing}</p>

        <ul className="mt-6 space-y-2">
          {[selected.cv, selected.letter ?? "No cover letter yet"].map((file) => (
            <li key={file} className="flex items-center gap-3 rounded-lg border bg-white p-3">
              <FileTextIcon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden /> {file}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-3">
          <StickyNoteIcon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          <p className="leading-relaxed">{selected.note}</p>
        </div>
      </div>
    </div>
  );
};

export default SheetDemo;
