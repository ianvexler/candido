"use client";

import { Button } from "@/components/ui/Button";
import InlineInput from "@/components/ui/InlineInput";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { Curriculum } from "@/lib/types";
import { ArrowLeftIcon, DownloadIcon, LayersIcon } from "lucide-react";
import NextLink from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

interface CvPageHeaderProps {
  curriculum: Curriculum;
  onRename: (title: string) => Promise<void>;
  onExport: () => void;
}

/** A CV's name, and the ways out of its page. */
const CvPageHeader = ({ curriculum, onRename, onExport }: CvPageHeaderProps) => {
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

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <NextLink
          // A tailored CV belongs to its job, so that's where back goes.
          href={curriculum.job_board_entry_id ? `/board?job=${curriculum.job_board_entry_id}` : "/resume"}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {curriculum.job_board_entry_id ? `${curriculum.tailored_for ?? "Job"} application` : "CVs"}
        </NextLink>
        <div className="flex items-center gap-4">
          <NextLink
            href="/resume/sections"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <LayersIcon className="size-4" />
            Section library
          </NextLink>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={onExport}>
                <DownloadIcon />
                Export PDF
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Opens a print view. Choose Save as PDF there.</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <InlineInput
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void saveTitle()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        aria-label="CV name"
        className="border-0 py-0 text-4xl font-bold tracking-tight"
      />
      <p className="mt-1 text-base font-light text-muted-foreground">
        Changes here only affect this CV, not your library.
      </p>
    </>
  );
};

export default CvPageHeader;
