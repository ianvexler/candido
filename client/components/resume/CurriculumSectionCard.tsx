"use client";

import { deleteCurriculumSection } from "@/api/resources/curriculums/deleteCurriculumSection";
import { syncCurriculumSection } from "@/api/resources/curriculums/syncCurriculumSection";
import { updateCurriculumSection } from "@/api/resources/curriculums/updateCurriculumSection";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { CurriculumSection } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useSortable } from "@dnd-kit/react/sortable";
import { EyeIcon, EyeOffIcon, GripVerticalIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import IconAction from "./IconAction";
import SectionDocument from "./SectionDocument";

interface CurriculumSectionCardProps {
  curriculumId: number;
  section: CurriculumSection;
  index: number;
  onChange: (section: CurriculumSection) => void;
  onRemoved: (id: number) => void;
}

/** One section of a resume: editable copy, draggable, hideable, and syncable with the library. */
const CurriculumSectionCard = ({ curriculumId, section, index, onChange, onRemoved }: CurriculumSectionCardProps) => {
  const { ref, handleRef, isDragging } = useSortable({ id: section.id, index });
  const [confirmSync, setConfirmSync] = useState(false);

  const toggleHidden = async () => {
    try {
      const response = await updateCurriculumSection(curriculumId, section.id, { hidden: !section.hidden });
      onChange(response.section);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update section");
    }
  };

  const pullFromLibrary = async () => {
    try {
      const response = await syncCurriculumSection(curriculumId, section.id);
      onChange(response.section);
      toast.success("Pulled the library version");
    } catch (error) {
      console.error(error);
      toast.error("Failed to pull the library version");
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

  const notice = (section.library_updated || section.hidden) && (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      {section.hidden && (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          <EyeOffIcon className="size-3" />
          Left out of this resume
        </span>
      )}
      {section.library_updated && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setConfirmSync(true)}
              className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-sky-900 transition-colors hover:bg-sky-100"
            >
              <RotateCcwIcon className="size-3" />
              Newer version in library
            </button>
          </TooltipTrigger>
          <TooltipContent>You edited this section in your library after adding it. Click to use that version here.</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <>
      <SectionDocument
        // Remount after a pull so the editor loads the new content.
        key={String(section.synced_at)}
        section={section}
        articleRef={ref}
        className={isDragging ? "shadow-xl ring-1 ring-foreground/10" : undefined}
        dimmed={section.hidden}
        notice={notice}
        save={async (fields) => (await updateCurriculumSection(curriculumId, section.id, fields)).section}
        onSaved={onChange}
        onDelete={remove}
        deleteLabel="Remove from this resume"
        deleteTitle="Remove this section from the resume?"
        deleteDescription="Only this resume's copy is removed. The section stays in your library."
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
            <IconAction
              label={section.hidden ? "Show in this resume" : "Leave out of this resume"}
              active={section.hidden}
              onClick={() => void toggleHidden()}
            >
              {section.hidden ? <EyeOffIcon /> : <EyeIcon />}
            </IconAction>
            {section.section_template_id && !section.library_updated && (
              <IconAction label="Reset to the library version" onClick={() => setConfirmSync(true)}>
                <RotateCcwIcon />
              </IconAction>
            )}
          </>
        }
      />

      <ConfirmationModal
        isOpen={confirmSync}
        onClose={() => setConfirmSync(false)}
        onConfirm={pullFromLibrary}
        title="Replace with the library version?"
        description="This resume's copy of the section is overwritten. Edits you made only in this resume are lost."
        confirmLabel="Replace"
      />
    </>
  );
};

export default CurriculumSectionCard;
