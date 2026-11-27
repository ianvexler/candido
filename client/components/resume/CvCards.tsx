"use client";

import { isLeftOut } from "@/lib/resume/exportDocument";
import type { SuggestionProps } from "./useEntrySuggestions";
import type { HeaderDraft } from "@/lib/resume/useHeaderDraft";
import type { EntryVersions } from "@/lib/resume/sectionDrafts";
import { CurriculumSection, CvSuggestion } from "@/lib/types";
import { ComponentProps } from "react";
import CurriculumSectionCard from "./CurriculumSectionCard";
import { HeaderSheet } from "./HeaderDocument";

const NO_SUGGESTIONS: CvSuggestion[] = [];

type CardProps = ComponentProps<typeof CurriculumSectionCard>;

interface CvCardsProps
  extends Omit<SuggestionProps, "suggestions">,
    Pick<CardProps, "onChange" | "onRemove" | "describeDeletion" | "twoColumn" | "leaveOutLocked"> {
  header: HeaderDraft;
  sections: CurriculumSection[];
  versions: Record<number, EntryVersions>;
  suggestionsBySection?: Map<number, CvSuggestion[]>;
}

/** A CV's header and sections as cards. */
const CvCards = ({ header, sections, versions, suggestionsBySection, ...card }: CvCardsProps) => (
  <>
    <HeaderSheet header={header} />
    {/* As the export has it, so a section being written in stays while it's blank. */}
    {sections
      .filter((section) => !isLeftOut(section))
      .map((section) => (
        <CurriculumSectionCard
          key={section.id}
          section={section}
          versions={versions[section.id]}
          suggestions={suggestionsBySection?.get(section.id) ?? NO_SUGGESTIONS}
          {...card}
        />
      ))}
  </>
);

export default CvCards;
