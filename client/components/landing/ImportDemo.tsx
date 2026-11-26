import { JobStatus, jobStatusColors } from "@/lib/types";
import { capitalize, cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";

const COLUMN_LETTERS = ["A", "B", "C", "D"];
const HEADERS = ["Title", "Company", "Status", "Location"];

// Like most real job-hunt sheets: a title and a blank row above the table, and statuses typed any old way.
const SHEET_TITLE = "Job hunt 2026 (keep updated!!)";
const JOBS = [
  { title: "Product Designer", company: "Fernway", status: "pending", location: "Leeds" },
  { title: "Data Analyst", company: "Tidemark Energy", status: "Applied", location: "Bristol" },
  { title: "Support Lead", company: "Oakline", status: "APPLIED", location: "Remote" },
  { title: "Frontend Engineer", company: "Pebble & Co", status: "interview", location: "London" },
];

// The board columns, filled from the sheet the way the import reads it: statuses matched regardless of case.
const BOARD = [JobStatus.PENDING, JobStatus.APPLIED, JobStatus.INTERVIEW].map((status) => ({
  status,
  jobs: JOBS.filter((job) => job.status.toUpperCase() === status),
}));

const rowNumber = "border-b border-r bg-neutral-50 px-2 text-center text-[12px] font-normal text-neutral-500";
const cell = "h-9 whitespace-nowrap border-b border-r px-2 last:border-r-0";

const Sheet = () => (
  <figure className="min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_24px_50px_-30px_rgb(0_0_0/0.5)] lg:-rotate-1">
    <figcaption className="border-b bg-neutral-50 px-4 py-2 font-mono text-[13px] text-neutral-600">
      my-jobs.xlsx
    </figcaption>
    {/* Scrolls sideways on phones, so it takes focus for keyboard users. */}
    <div tabIndex={0} role="region" aria-label="Example spreadsheet" className="overflow-x-auto focus-visible:outline-offset-[-3px]!">
      <table className="w-full border-collapse text-left text-[13px] sm:text-[14px]">
        <thead>
          <tr aria-hidden className="bg-neutral-50 text-[12px] text-neutral-500">
            <td className="w-8 border-b border-r" />
            {COLUMN_LETTERS.map((letter) => (
              <td key={letter} className="border-b border-r px-2 py-1 text-center last:border-r-0">{letter}</td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={rowNumber}>1</th>
            <td colSpan={HEADERS.length} className="h-9 border-b px-2 font-semibold">{SHEET_TITLE}</td>
          </tr>
          <tr>
            <th scope="row" className={rowNumber}>2</th>
            {HEADERS.map((header) => <td key={header} className={cell} />)}
          </tr>
          <tr className="bg-[#fff0d2]">
            <th scope="row" className={rowNumber}>3</th>
            {HEADERS.map((header) => (
              <th key={header} scope="col" className={cn(cell, "font-semibold")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-[#fff0d2]">
          {JOBS.map((job, index) => (
            <tr key={job.company}>
              <th scope="row" className={rowNumber}>{index + 4}</th>
              {[job.title, job.company, job.status, job.location].map((value, column) => (
                <td key={column} className={cell}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </figure>
);

const Board = () => (
  <div aria-label="The same jobs on your board" role="group" className="grid min-w-0 grid-cols-3 gap-2 rounded-xl bg-candido-black p-2 sm:gap-3 sm:p-3">
    {BOARD.map((column) => (
      <div key={column.status} className="min-w-0 rounded-lg bg-white/10 p-1.5 sm:min-h-[220px] sm:p-2">
        <p className="mb-2 px-1 text-[12px] font-semibold text-white sm:text-[13px]">
          {capitalize(column.status.toLowerCase())} <span className="font-normal text-white/60">{column.jobs.length}</span>
        </p>
        <ul className="space-y-1.5 sm:space-y-2">
          {column.jobs.map((job) => (
            <li key={job.company} className="rounded-md bg-white px-2 py-2 text-[12px] sm:px-3 sm:py-3 sm:text-[14px]">
              <div className="relative pl-2.5">
                <span className={cn("absolute inset-y-0 left-0 w-1 rounded", jobStatusColors[column.status])} aria-hidden />
                <p className="font-semibold leading-tight">{job.title}</p>
                <p className="truncate text-neutral-600">{job.company}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

/** A messy spreadsheet, and the board Candido makes from it. */
const ImportDemo = () => (
  <div className="grid items-center gap-4 lg:grid-cols-[1.1fr_auto_1fr] lg:gap-6">
    <Sheet />
    <ArrowRightIcon className="mx-auto size-9 rotate-90 lg:rotate-0" strokeWidth={2.5} aria-hidden />
    <Board />
  </div>
);

export default ImportDemo;
