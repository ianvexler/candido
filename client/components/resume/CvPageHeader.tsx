"use client";

import { Button } from "@/components/ui/Button";
import InlineInput from "@/components/ui/InlineInput";
import Segmented from "@/components/ui/Segmented";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { Curriculum } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, DownloadIcon, LibraryBigIcon } from "lucide-react";
import NextLink from "next/link";
import { ReactNode, useState } from "react";
import toast from "react-hot-toast";
import type { CvView } from "./useCvView";

const VIEWS = [
  { value: "cards", label: "Cards" },
  { value: "page", label: "Page" },
] as const;

interface CvPageHeaderProps {
  curriculum: Curriculum;
  onRename: (title: string) => Promise<void>;
  onExport: () => void;
  view: CvView;
  onViewChange: (view: CvView) => void;
  /** What opens the design, where that isn't beside the CV. */
  design: ReactNode;
  /** Leaves the room to what is below. */
  compact: boolean;
}

/** A CV's name, how it is shown, and the ways out of its page. */
const CvPageHeader = ({ curriculum, onRename, onExport, view, onViewChange, design, compact }: CvPageHeaderProps) => {
  const [title, setTitle] = useState(curriculum.title);

  const saveTitle = async () => {
    const next = title.trim();
    setTitle(next || curriculum.title);
    if (!next || next === curriculum.title) return;

    try {
      await onRename(next);
    } catch (error) {
      console.error(error);
      toast.error("Failed to rename CV");
    }
  };

  const name = (
    <InlineInput
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => void saveTitle()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      aria-label="CV name"
      className={cn("border-0 py-0 tracking-tight", compact ? "text-lg font-semibold" : "text-4xl font-bold")}
    />
  );

  // The name and the switch stay the same elements: either may have the focus.
  return (
    <header
      className={cn(
        "flex shrink-0 items-center border-b border-border",
        compact ? "gap-x-5 gap-y-2 px-5 py-2.5 max-lg:flex-wrap" : "flex-wrap justify-between gap-x-4 gap-y-2 px-6 py-5"
      )}
    >
      <NextLink
        // A tailored CV belongs to its job, so that's where back goes.
        href={curriculum.job_board_entry_id ? `/board?job=${curriculum.job_board_entry_id}` : "/resume"}
        className="inline-flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4 shrink-0" />
        <span className={cn(compact && "max-w-40 truncate")}>
          {curriculum.job_board_entry_id ? `${curriculum.tailored_for ?? "Job"} application` : "CVs"}
        </span>
      </NextLink>
      <div className={compact ? "min-w-0 flex-1" : "order-last w-full"}>
        {name}
        {!compact && (
          <p className="mt-1 text-base font-light text-muted-foreground">
            Changes here only affect this CV, unless you send them to your library.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:shrink-0">
        <NextLink
          href="/resume/sections"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <LibraryBigIcon className="size-4" />
          Section library
        </NextLink>
        {/* On a smaller screen the page may only be held there by a month that isn't finished. */}
        <Segmented label="View" options={VIEWS} value={view} onChange={onViewChange} className={cn(!compact && "max-lg:hidden")} />
        {design}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={onExport}>
              <DownloadIcon />
              Export PDF
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Opens the print dialog. Choose Save as PDF.</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};

export default CvPageHeader;
