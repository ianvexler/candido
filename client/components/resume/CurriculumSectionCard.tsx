"use client";

import type { ChecklistActions } from "@/lib/resume/useCvChecklist";
import { sectionColumn } from "@/lib/resume/exportDocument";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import { CurriculumSection, CvSuggestion } from "@/lib/types";
import { PanelLeftIcon } from "lucide-react";
import { memo, useCallback } from "react";
import SectionDocument from "./SectionDocument";
import type { SuggestionAction } from "./review/SuggestionCard";
import { REMOVE_SECTION } from "./removeSection";

interface CurriculumSectionCardProps {
  section: CurriculumSection;
  /** See SectionDocument. */
  versions?: EntryVersions;
  onChange: (id: number, change: SectionChange, editor?: EntryEditor) => void;
  onRemove: ChecklistActions["removeSection"];
  /** The resume uses a two-column template. */
  twoColumn?: boolean;
  /** This section's review suggestions; see SectionDocument. */
  suggestions?: CvSuggestion[];
  activeSuggestionId?: number | null;
  onSuggestionClick?: (id: number) => void;
  onSuggestionClose?: () => void;
  onSuggestionResolve?: (s: CvSuggestion, action: SuggestionAction, text?: string) => Promise<void>;
}

/** One section of a CV: an editable copy, showing what is ticked. */
const CurriculumSectionCard = ({
  section,
  versions,
  onChange,
  onRemove,
  twoColumn = false,
  ...suggestionProps
}: CurriculumSectionCardProps) => {
  const { id } = section;
  const change = useCallback(
    (patch: SectionChange, editor?: EntryEditor) => onChange(id, patch, editor),
    [id, onChange]
  );

  return (
    <SectionDocument
      section={section}
      inCv
      notice={
        twoColumn && sectionColumn(section) === "sidebar" && (
          <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <PanelLeftIcon className="size-3" />
            In the sidebar
          </span>
        )
      }
      versions={versions}
      onChange={change}
      onDelete={() => onRemove(id)}
      deleteLabel={REMOVE_SECTION.label}
      deleteTitle={REMOVE_SECTION.title}
      deleteDescription={REMOVE_SECTION.description}
      {...suggestionProps}
    />
  );
};

export default memo(CurriculumSectionCard);
