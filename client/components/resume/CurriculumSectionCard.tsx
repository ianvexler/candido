"use client";

import { deleteCurriculumSection } from "@/api/resources/curriculums/deleteCurriculumSection";
import { updateCurriculumSection } from "@/api/resources/curriculums/updateCurriculumSection";
import { CurriculumSection, CvSuggestion } from "@/lib/types";
import { useSortable } from "@dnd-kit/react/sortable";
import { sectionColumn } from "@/lib/resume/exportDocument";
import { EyeIcon, EyeOffIcon, GripVerticalIcon, PanelLeftIcon } from "lucide-react";
import toast from "react-hot-toast";
import IconAction from "./IconAction";
import { trackSave } from "@/lib/resume/saveTracker";
import SectionDocument from "./SectionDocument";
import type { SuggestionAction } from "./review/SuggestionCard";

interface CurriculumSectionCardProps {
  curriculumId: number;
  section: CurriculumSection;
  index: number;
  onChange: (section: CurriculumSection) => void;
  onRemoved: (id: number) => void;
  /** The resume uses a two-column template, so the section can move between columns. */
  twoColumn?: boolean;
  /** This section's review suggestions; see SectionDocument. */
  suggestions?: CvSuggestion[];
  activeSuggestionId?: number | null;
  onSuggestionClick?: (id: number) => void;
  onSuggestionClose?: () => void;
  onSuggestionResolve?: (s: CvSuggestion, action: SuggestionAction, text?: string) => Promise<void>;
  onStaleChange?: (staleIds: number[]) => void;
}

/** One section of a resume: editable copy, draggable and hideable. */
const CurriculumSectionCard = ({
  curriculumId,
  section,
  index,
  onChange,
  onRemoved,
  twoColumn = false,
  suggestions,
  activeSuggestionId,
  onSuggestionClick,
  onSuggestionClose,
  onSuggestionResolve,
  onStaleChange,
}: CurriculumSectionCardProps) => {
  const { ref, handleRef, isDragging } = useSortable({ id: section.id, index });
  const inSidebar = twoColumn && sectionColumn(section) === "sidebar";

  // Stores the choice explicitly, so it wins over the guess from the section type.
  const toggleColumn = async () => {
    try {
      const response = await trackSave(
        `section-${section.id}`,
        updateCurriculumSection(curriculumId, section.id, { placement: inSidebar ? "main" : "sidebar" })
      );
      onChange(response.section);
    } catch (error) {
      console.error(error);
      toast.error("Failed to move the section");
    }
  };

  const toggleHidden = async () => {
    try {
      const response = await trackSave(
        `section-${section.id}`,
        updateCurriculumSection(curriculumId, section.id, { hidden: !section.hidden })
      );
      onChange(response.section);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update section");
    }
  };

  const remove = async () => {
    try {
      await deleteCurriculumSection(curriculumId, section.id);
      onRemoved(section.id);
    } catch (error) {
      console.error(error);
      toast.error("Failed to remove section");
    }
  };

  const notice = (section.hidden || inSidebar) && (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      {inSidebar && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          <PanelLeftIcon className="size-3" />
          In the sidebar
        </span>
      )}
      {section.hidden && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          <EyeOffIcon className="size-3" />
          Left out of this CV
        </span>
      )}
    </div>
  );

  return (
    <SectionDocument
      section={section}
      articleRef={ref}
      className={isDragging ? "shadow-xl ring-1 ring-foreground/10" : undefined}
      dimmed={section.hidden}
      canHideEntries
      notice={notice}
      save={async (fields) => (await updateCurriculumSection(curriculumId, section.id, fields)).section}
      onSaved={onChange}
      onDelete={remove}
      deleteLabel="Remove from this CV"
      deleteTitle="Remove this section from the CV?"
      deleteDescription="Only this CV's copy is removed. The section stays in your library."
      suggestions={suggestions}
      activeSuggestionId={activeSuggestionId}
      onSuggestionClick={onSuggestionClick}
      onSuggestionClose={onSuggestionClose}
      onSuggestionResolve={onSuggestionResolve}
      onStaleChange={onStaleChange}
      handle={
        <IconAction
          label="Drag to reorder"
          side="left"
          buttonRef={handleRef}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVerticalIcon />
        </IconAction>
      }
      actions={
        <>
          {twoColumn && (
            <IconAction
              label={inSidebar ? "Move to the main column" : "Move to the sidebar"}
              active={inSidebar}
              onClick={() => void toggleColumn()}
            >
              <PanelLeftIcon />
            </IconAction>
          )}
          <IconAction
            label={section.hidden ? "Show in this CV" : "Leave out of this CV"}
            active={section.hidden}
            onClick={() => void toggleHidden()}
          >
            {section.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </IconAction>
        </>
      }
    />
  );
};

export default CurriculumSectionCard;
