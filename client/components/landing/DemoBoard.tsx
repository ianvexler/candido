"use client";

import { JobStatus, jobStatusColors } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import { BriefcaseIcon, ClockIcon, GlobeIcon, HandshakeIcon, PhoneIcon, TagIcon } from "lucide-react";
import { ReactNode, useState } from "react";
import HardHat from "./HardHat";

const COLUMNS = [
  { status: JobStatus.PENDING, label: "Pending", icon: ClockIcon },
  { status: JobStatus.APPLIED, label: "Applied", icon: BriefcaseIcon },
  { status: JobStatus.INTERVIEW, label: "Interview", icon: PhoneIcon },
  { status: JobStatus.OFFERED, label: "Offered", icon: HandshakeIcon },
];

type DemoJob = {
  id: string;
  title: string;
  company: string;
  tags: string;
  location: string;
  status: JobStatus;
};

// Invented companies, so nothing here implies a real one uses or endorses Candido.
const JOBS: DemoJob[] = [
  { id: "demo-1", title: "Product Designer", company: "Fernway", tags: "Hybrid, B2B", location: "Leeds", status: JobStatus.PENDING },
  { id: "demo-2", title: "Data Analyst", company: "Tidemark Energy", tags: "Full-time", location: "Bristol", status: JobStatus.PENDING },
  { id: "demo-3", title: "Support Lead", company: "Oakline", tags: "Remote", location: "Anywhere", status: JobStatus.APPLIED },
  { id: "demo-4", title: "Frontend Engineer", company: "Pebble & Co", tags: "React, Startup", location: "London", status: JobStatus.INTERVIEW },
];

const nextColumn = (status: JobStatus) => COLUMNS[COLUMNS.findIndex((column) => column.status === status) + 1];

const DemoCard = ({ job, onMove }: { job: DemoJob; onMove: (id: string, status: JobStatus) => void }) => {
  // isDragSource stays true through the drop animation, so the hat waits until the card has landed.
  const { ref, handleRef, isDragging, isDragSource } = useDraggable({ id: job.id });
  const next = nextColumn(job.status);
  const isOffered = job.status === JobStatus.OFFERED;

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-xl bg-white text-[13px] text-candido-black",
        isDragging && "rotate-3 shadow-2xl"
      )}
    >
      {isOffered && !isDragSource && (
        <HardHat className="hat-drop pointer-events-none absolute -right-2 -top-5 z-10 w-12 drop-shadow" />
      )}

      <div ref={handleRef} className="cursor-grab select-none rounded-xl px-3 pb-2 pt-3 active:cursor-grabbing sm:px-4">
        <div className="relative pl-3">
          <span className={cn("absolute inset-y-0 left-0 w-1 rounded", jobStatusColors[job.status])} aria-hidden />
          <p className="text-[14px] font-semibold leading-tight sm:text-[15px]">{job.title}</p>
          <p className="text-neutral-600">{job.company}</p>
        </div>
        <p className="mt-3 hidden items-center gap-1.5 sm:flex">
          <TagIcon className="size-3.5 shrink-0" strokeWidth={1.5} /> {job.tags}
        </p>
        <p className="mt-1 hidden items-center gap-1.5 sm:flex">
          <GlobeIcon className="size-3.5 shrink-0" strokeWidth={1.5} /> {job.location}
        </p>
      </div>

      <div className="mx-3 border-t py-1 sm:mx-4">
        {next ? (
          <button
            type="button"
            onClick={() => onMove(job.id, next.status)}
            className="-mx-1 min-h-9 cursor-pointer rounded px-1 text-left font-medium text-neutral-700 hover:text-black hover:underline"
          >
            Move to {next.label}
          </button>
        ) : (
          <p className="flex min-h-9 items-center font-medium text-emerald-800">You got the offer</p>
        )}
      </div>
    </div>
  );
};

const DemoColumn = ({
  column,
  isEmpty,
  children,
}: {
  column: (typeof COLUMNS)[number];
  isEmpty: boolean;
  children: ReactNode;
}) => {
  const { ref, isDropTarget } = useDroppable({ id: column.status });
  const Icon = column.icon;
  const isOffered = column.status === JobStatus.OFFERED;

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl p-1 transition-colors",
        isDropTarget && (isOffered ? "hazard" : "bg-candido")
      )}
    >
      <div className={cn("flex h-full flex-col gap-3 rounded-xl p-2 sm:p-3", isOffered ? "bg-[#4a4233]" : "bg-[#363636]")}>
        <p className="flex items-center justify-between px-1 text-[15px] font-semibold text-white">
          {column.label}
          <Icon className="size-4" aria-hidden />
        </p>
        {children}
        {isEmpty && (
          <p className="grid min-h-24 flex-1 place-items-center rounded-lg border-2 border-dashed border-white/35 p-3 text-center text-[14px] text-white/85">
            {isOffered ? "Bring one home" : "Drop a card here"}
          </p>
        )}
      </div>
    </div>
  );
};

/** A working board, so visitors can try the product before signing up. */
const DemoBoard = () => {
  const [jobs, setJobs] = useState(JOBS);
  const [announcement, setAnnouncement] = useState("");

  const moveJob = (id: string, status: JobStatus) => {
    const job = jobs.find((candidate) => candidate.id === id);
    const column = COLUMNS.find((candidate) => candidate.status === status);
    if (!job || !column || job.status === status) return;

    setJobs([...jobs.filter((candidate) => candidate.id !== id), { ...job, status }]);
    setAnnouncement(`${job.title} moved to ${column.label}`);
  };

  return (
    <DragDropProvider
      onDragEnd={({ canceled, operation }) => {
        if (canceled || !operation.source || !operation.target) return;
        moveJob(String(operation.source.id), operation.target.id as JobStatus);
      }}
    >
      <section aria-label="Try the board" className="landing-dark rounded-3xl bg-candido-black p-3 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 px-2 pb-3 text-white">
          <p className="text-[16px] font-semibold">This board works. Drag a card to Offered.</p>
          <button
            type="button"
            onClick={() => {
              setJobs(JOBS);
              setAnnouncement("Board reset");
            }}
            className="min-h-9 cursor-pointer rounded text-[14px] text-white/85 underline underline-offset-4 hover:text-white"
          >
            Reset board
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 lg:min-h-[390px] lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const columnJobs = jobs.filter((job) => job.status === column.status);
            return (
              <DemoColumn key={column.status} column={column} isEmpty={columnJobs.length === 0}>
                {columnJobs.map((job) => (
                  <DemoCard key={job.id} job={job} onMove={moveJob} />
                ))}
              </DemoColumn>
            );
          })}
        </div>
        <p className="sr-only" role="status">{announcement}</p>
      </section>
    </DragDropProvider>
  );
};

export default DemoBoard;
