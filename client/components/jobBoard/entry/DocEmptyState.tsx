"use client";

import { DocKind, FillWay } from "@/lib/jobBoard/docSlot";
import { cn } from "@/lib/utils";
import { ClipboardTypeIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { ReactNode } from "react";

interface DocEmptyStateProps {
  kind: DocKind;
  /** Applied already: the document is a record of what was sent, not something to prepare. */
  applied: boolean;
  ways: FillWay[];
  fill: (way: FillWay) => void;
  saving: boolean;
  dragging: boolean;
}

const WAYS: Record<FillWay, { icon: ReactNode; label: string; hint: Record<DocKind, string> }> = {
  use: {
    icon: <SparklesIcon />,
    label: "Tailor a CV",
    hint: { cv: "Copy one of your CVs for this job and get edits that help it fit.", cover_letter: "" },
  },
  upload: {
    icon: <UploadIcon />,
    label: "Upload a PDF",
    hint: { cv: "The exact file, as a PDF.", cover_letter: "The exact file, as a PDF." },
  },
  paste: {
    icon: <ClipboardTypeIcon />,
    label: "Paste text",
    hint: { cv: "Its text, pasted in.", cover_letter: "Its text, pasted in." },
  },
};

const ORDER: FillWay[] = ["use", "upload", "paste"];

const COPY: Record<DocKind, Record<"pending" | "applied", { title: string; description: string }>> = {
  cv: {
    pending: {
      title: "No CV for this job yet",
      description: "Add the CV you'll send. It shows here, with how well it covers what the job asks for.",
    },
    applied: {
      title: "No CV saved for this job",
      description: "Add the CV you sent, so you know what they have in front of them when they get in touch.",
    },
  },
  cover_letter: {
    pending: { title: "No cover letter yet", description: "Optional. Add the letter you'll send with your CV." },
    applied: { title: "No cover letter saved", description: "Add the letter you sent, if there was one." },
  },
};

/** An empty document on the job's page: a faint sheet where it will show, and the ways to add it. */
const DocEmptyState = ({ kind, applied, ways, fill, saving, dragging }: DocEmptyStateProps) => {
  const { title, description } = COPY[kind][applied ? "applied" : "pending"];
  const options = ORDER.filter((way) => ways.includes(way));

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] transition-shadow dark:bg-card",
        dragging && "ring-2 ring-candido"
      )}
    >
      {/* Where the document will show, sketched. */}
      <div aria-hidden className="space-y-2.5 px-6 pt-8 sm:px-10">
        {kind === "cv" ? (
          <>
            <div className="mx-auto h-4 w-40 rounded bg-muted" />
            <div className="mx-auto h-2.5 w-64 max-w-full rounded bg-muted" />
            <div className="mt-7! h-2.5 w-24 rounded bg-muted" />
            <div className="h-2 w-full rounded bg-muted/70" />
            <div className="h-2 w-11/12 rounded bg-muted/70" />
            <div className="h-2 w-4/5 rounded bg-muted/70" />
          </>
        ) : (
          <>
            <div className="h-2.5 w-32 rounded bg-muted" />
            <div className="mt-6! h-2 w-full rounded bg-muted/70" />
            <div className="h-2 w-11/12 rounded bg-muted/70" />
            <div className="h-2 w-3/4 rounded bg-muted/70" />
          </>
        )}
      </div>

      <div className="relative -mt-6 bg-gradient-to-b from-transparent to-white to-30% px-6 pb-8 pt-10 text-center dark:to-card sm:px-10">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>

        <div className={cn("mt-6 grid gap-3", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {options.map((way) => {
            const { icon, label, hint } = WAYS[way];
            const primary = way === "use";
            return (
              <button
                key={way}
                type="button"
                onClick={() => fill(way)}
                disabled={saving}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
                  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  primary ? "border-candido bg-candido/15 hover:bg-candido/25" : "bg-background hover:bg-muted/60"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 place-items-center rounded-md [&_svg]:size-4",
                    primary ? "bg-candido text-candido-ink" : "bg-muted text-foreground"
                  )}
                >
                  {icon}
                </span>
                <span className="text-sm font-medium">{saving && way === "upload" ? "Uploading…" : label}</span>
                {hint[kind] && <span className="text-xs leading-relaxed text-muted-foreground">{hint[kind]}</span>}
              </button>
            );
          })}
        </div>

        {ways.includes("upload") && (
          <p className="mt-4 text-xs text-muted-foreground">Or drop a PDF anywhere on this sheet.</p>
        )}
      </div>
    </div>
  );
};

export default DocEmptyState;
