"use client";

import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import { SectionTemplate } from "@/lib/types";
import { memo, useCallback } from "react";
import SectionDocument from "./SectionDocument";

interface LibrarySectionProps {
  template: SectionTemplate;
  /** See SectionDocument. */
  versions?: EntryVersions;
  onChange: (id: number, change: SectionChange, editor?: EntryEditor) => void;
  onDelete: (id: number) => Promise<void>;
}

const describeDeletion = (entryId?: string) =>
  entryId === undefined
    ? "This removes the reusable section from your library. CVs that already use it keep their copy."
    : "This removes it from the library section. CVs that already use it keep their copy.";

/** One section of the library. */
const LibrarySection = ({ template, versions, onChange, onDelete }: LibrarySectionProps) => {
  const { id } = template;
  const change = useCallback(
    (patch: SectionChange, editor?: EntryEditor) => onChange(id, patch, editor),
    [id, onChange]
  );

  return (
    <SectionDocument
      section={template}
      versions={versions}
      onChange={change}
      onDelete={() => onDelete(id)}
      deleteLabel="Delete from library"
      deleteTitle="Delete this section?"
      describeDeletion={describeDeletion}
    />
  );
};

export default memo(LibrarySection);
