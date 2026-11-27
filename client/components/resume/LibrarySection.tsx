"use client";

import { listItems } from "@/lib/resume/items";
import type { EntryEditor, EntryVersions, SectionChange } from "@/lib/resume/sectionDrafts";
import { SectionTemplate } from "@/lib/types";
import { memo, useCallback, useMemo, useState } from "react";
import type { LibraryLabelling } from "./library/LabelArea";
import SelectionBar from "./library/SelectionBar";
import SectionDocument from "./SectionDocument";

/** What the page gives; the selection is kept here, so it goes when the section does. */
export type SectionLabelling = Omit<LibraryLabelling, "selected" | "onToggleSelect">;

interface LibrarySectionProps {
  template: SectionTemplate;
  /** See SectionDocument. */
  versions?: EntryVersions;
  onChange: (id: number, change: SectionChange, editor?: EntryEditor) => void;
  onDelete: (id: number) => Promise<void>;
  labelling: SectionLabelling;
}

const describeDeletion = (entryId?: string) =>
  entryId === undefined
    ? "This removes the reusable section from your library. CVs that already use it keep their copy."
    : "This removes it from the library section. CVs that already use it keep their copy.";

/** One section of the library. */
const LibrarySection = ({ template, versions, onChange, onDelete, labelling }: LibrarySectionProps) => {
  const { id, entries } = template;
  const change = useCallback(
    (patch: SectionChange, editor?: EntryEditor) => onChange(id, patch, editor),
    [id, onChange]
  );

  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set());
  // Those still in the section: a selected item may have been deleted since.
  const selected = useMemo(() => {
    if (chosen.size === 0) return chosen;
    const present = new Set(entries.flatMap((entry) => listItems(entry.content ?? "").map((item) => item.id)));
    const kept = [...chosen].filter((itemId) => present.has(itemId));
    return kept.length === chosen.size ? chosen : new Set(kept);
  }, [chosen, entries]);
  const onToggleSelect = useCallback((_entryId: string, itemId: string) => {
    setChosen((now) => {
      const next = new Set(now);
      if (!next.delete(itemId)) next.add(itemId);
      return next;
    });
  }, []);
  const library = useMemo(() => ({ ...labelling, selected, onToggleSelect }), [labelling, selected, onToggleSelect]);

  return (
    <>
      <SectionDocument
        section={template}
        versions={versions}
        onChange={change}
        onDelete={() => onDelete(id)}
        deleteLabel="Delete from library"
        deleteTitle="Delete this section?"
        describeDeletion={describeDeletion}
        library={library}
      />
      {selected.size > 0 && (
        <SelectionBar
          sectionId={id}
          selected={selected}
          labels={labelling.labels}
          filter={labelling.filter}
          onLabel={labelling.onLabel}
          onCreate={labelling.onCreate}
          onClear={() => setChosen(new Set())}
        />
      )}
    </>
  );
};

export default memo(LibrarySection);
