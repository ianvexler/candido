"use client";

import { deleteCurriculumSection } from "@/api/resources/curriculums/deleteCurriculumSection";
import { syncCurriculumSection } from "@/api/resources/curriculums/syncCurriculumSection";
import { updateCurriculumSection } from "@/api/resources/curriculums/updateCurriculumSection";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { CurriculumSection } from "@/lib/types";
import { useSortable } from "@dnd-kit/react/sortable";
import { EyeIcon, EyeOffIcon, GripVerticalIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
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
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      {section.hidden && (
        <span className="rounded-sm bg-muted px-2 py-1 font-medium text-muted-foreground">Hidden from this resume</span>
      )}
      {section.library_updated && (
        <span className="inline-flex items-center gap-2 rounded-sm bg-sky-50 px-2 py-1 text-sky-900">
          The library version changed since you added this.
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => setConfirmSync(true)}
          >
            Pull changes
          </button>
        </span>
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
        deleteTitle="Remove this section from the resume?"
        deleteDescription="Only this resume's copy is removed. The section stays in your library."
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void toggleHidden()}
                  aria-label={section.hidden ? "Show section in this resume" : "Hide section from this resume"}
                >
                  {section.hidden ? <EyeIcon /> : <EyeOffIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{section.hidden ? "Show in this resume" : "Hide from this resume"}</TooltipContent>
            </Tooltip>
            {section.section_template_id && !section.library_updated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmSync(true)}
                    aria-label="Reset to library version"
                  >
                    <RefreshCwIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to library version</TooltipContent>
              </Tooltip>
            )}
            <Button
              ref={handleRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVerticalIcon />
            </Button>
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
