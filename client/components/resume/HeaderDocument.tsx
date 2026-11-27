"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { HeaderValues } from "@/lib/resume/headerDraft";
import { HeaderDraft, useHeaderDraft } from "@/lib/resume/useHeaderDraft";
import { ResumeHeader } from "@/lib/types";
import { InfoIcon } from "lucide-react";
import { ComponentType, useEffect, useRef } from "react";
import { HeaderFields, HeaderText } from "./HeaderFields";

/** The name and contact block at the top of a resume. */
export const HeaderSheet = ({ header }: { header: HeaderDraft }) => (
  <article className="group/header relative mx-auto w-full max-w-2xl bg-white px-10 py-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14">
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="About the header"
          className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <InfoIcon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">
        {header.fallback
          ? "Grey text comes from your profile. Type over a field to change it for this CV only."
          : "Your name and contact details, shown at the top of every CV. Each CV can change them."}
      </TooltipContent>
    </Tooltip>

    <HeaderText header={header} field="name" placeholder="Your name" className="py-0.5 text-2xl font-bold" />
    <HeaderText
      header={header}
      field="headline"
      placeholder="Headline, e.g. Backend engineer"
      className="mt-0.5 py-0.5 text-base text-muted-foreground"
    />

    <HeaderFields header={header} />
  </article>
);

interface HeaderDocumentProps<T extends HeaderValues> {
  value: T;
  /**
   * Resume mode: the profile values. Blank fields show these as placeholders
   * and fall back to them. Omit when editing the profile itself.
   */
  fallback?: ResumeHeader;
  save: (draft: T) => Promise<void>;
  /** A new one takes the value anew; what was still unsaved is dropped. */
  version?: number;
  /** What shows the fields; a CV's page unless another is given, as the library's is. */
  sheet?: ComponentType<{ header: HeaderDraft }>;
}

/** A header's sheet that saves itself after a pause. */
const HeaderDocument = <T extends HeaderValues>({
  value,
  fallback,
  save,
  version = 0,
  sheet: Sheet = HeaderSheet,
}: HeaderDocumentProps<T>) => {
  const header = useHeaderDraft({ value, fallback, save });
  const { load } = header;
  const loaded = useRef(version);
  useEffect(() => {
    if (loaded.current === version) return;
    loaded.current = version;
    load(value);
  }, [version, value, load]);

  return <Sheet header={header} />;
};

export default HeaderDocument;
