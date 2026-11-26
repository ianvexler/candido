import { JobStatus, jobStatusColors } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";

const COLUMNS = ["A", "B", "C", "D"];

// The header row sits below a title and a blank row, as it does in most real job-hunt sheets.
const SHEET_ROWS: (string[] | null)[] = [
  ["Job hunt 2026 (keep updated!!)"],
  null,
  ["Title", "Company", "Status", "Location"],
  ["Product Designer", "Fernway", "pending", "Leeds"],
  ["Data Analyst", "Tidemark Energy", "Applied", "Bristol"],
  ["Support Lead", "Oakline", "APPLIED", "Remote"],
  ["Frontend Engineer", "Pebble & Co", "interview", "London"],
];

const TABLE_START = 2;

const BOARD = [
  { label: "Pending", status: JobStatus.PENDING, jobs: [["Product Designer", "Fernway"]] },
  { label: "Applied", status: JobStatus.APPLIED, jobs: [["Data Analyst", "Tidemark Energy"], ["Support Lead", "Oakline"]] },
  { label: "Interview", status: JobStatus.INTERVIEW, jobs: [["Frontend Engineer", "Pebble & Co"]] },
];

const Sheet = () => (
  <figure className="min-w-0 overflow-hidden rounded-xl bg-white shadow-[0_24px_50px_-30px_rgb(0_0_0/0.5)] lg:-rotate-1">
    <figcaption className="border-b bg-neutral-50 px-4 py-2 font-mono text-[13px] text-neutral-600">
      my-jobs.xlsx
    </figcaption>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px] sm:text-[14px]">
        <thead>
          <tr className="bg-neutral-50 text-[12px] text-neutral-500">
            <th scope="col" className="w-8 border-b border-r font-normal" aria-label="Row" />
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="border-b border-r px-2 py-1 text-center font-normal last:border-r-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHEET_ROWS.map((row, index) => {
            const isHeader = index === TABLE_START;
            const isTable = index >= TABLE_START;
            return (
              <tr key={index} className={cn(isTable && "bg-[#fff0d2]", isHeader && "font-semibold")}>
                <td className="min-w-8 border-b border-r bg-neutral-50 text-center text-[12px] text-neutral-500">{index + 1}</td>
                {row && row.length === 1 ? (
                  <td colSpan={COLUMNS.length} className="h-9 border-b px-2 font-semibold">{row[0]}</td>
                ) : (
                  COLUMNS.map((column, cell) => (
                    <td key={column} className="h-9 whitespace-nowrap border-b border-r px-2 last:border-r-0">
                      {row?.[cell]}
                    </td>
                  ))
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </figure>
);

const Board = () => (
  <div aria-label="The same jobs on your board" role="group" className="grid min-w-0 grid-cols-3 gap-2 rounded-xl bg-candido-black p-2 sm:gap-3 sm:p-3">
    {BOARD.map((column) => (
      <div key={column.label} className="min-w-0 rounded-lg bg-white/10 p-1.5 sm:min-h-[220px] sm:p-2">
        <p className="mb-2 px-1 text-[12px] font-semibold text-white sm:text-[13px]">
          {column.label} <span className="font-normal text-white/60">{column.jobs.length}</span>
        </p>
        <ul className="space-y-1.5 sm:space-y-2">
          {column.jobs.map(([title, company]) => (
            <li key={company} className="rounded-md bg-white px-2 py-2 text-[12px] sm:px-3 sm:py-3 sm:text-[14px]">
              <div className="relative pl-2.5">
                <span className={cn("absolute inset-y-0 left-0 w-1 rounded", jobStatusColors[column.status])} aria-hidden />
                <p className="font-semibold leading-tight">{title}</p>
                <p className="truncate text-neutral-600">{company}</p>
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
