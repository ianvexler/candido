"use client";

import type { EntryEditor, SectionChange } from "@/lib/resume/sectionDrafts";
import type { CvSuggestion, SectionEntry } from "@/lib/types";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { EntryChange } from "../useEntryEditor";
import type { SuggestionProps } from "../useEntrySuggestions";
import { entryKey, NearStore } from "./nearStore";
import type { PageEditors } from "./pageEditors";
import PageEntryBody from "./PageEntryBody";

/** The drafts' change. */
export type OnSectionChange = (id: number, change: SectionChange, editor?: EntryEditor) => void;

export type Bodies = SuggestionProps & {
  onSectionChange: OnSectionChange;
  editors: PageEditors;
  near: NearStore;
  open: { sectionId: number; entryId: string } | null;
  suggestionsBySection?: Map<number, CvSuggestion[]>;
};

export const BodiesContext = createContext<Bodies | null>(null);

export const changeEntry = (
  onSectionChange: OnSectionChange,
  sectionId: number,
  entryId: string,
  changes: EntryChange,
  version?: number
) =>
  onSectionChange(
    sectionId,
    (current) => ({
      entries: current.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
      ),
    }),
    version === undefined ? undefined : { entryId, version }
  );

interface BodySlotProps {
  sectionId: number;
  /** Reviews from before sections had entries are about this one. */
  isFirst: boolean;
  entry: SectionEntry;
  version: number;
}

/** An entry's content on the page. */
const BodySlot = ({ sectionId, isFirst, entry, version }: BodySlotProps) => {
  const { onSectionChange, editors, near, open, suggestionsBySection, ...suggestionProps } = useContext(BodiesContext)!;
  const key = entryKey(sectionId, entry.id);
  const subscribe = useCallback((listener: () => void) => near.subscribe(key, listener), [near, key]);
  const isNear = useSyncExternalStore(subscribe, () => near.has(key));
  const onEntryChange = useCallback(
    (id: string, changes: EntryChange, from?: number) => changeEntry(onSectionChange, sectionId, id, changes, from),
    [onSectionChange, sectionId]
  );
  const ofSection = suggestionsBySection?.get(sectionId);
  const suggestions = useMemo(
    () => ofSection?.filter((s) => (s.entry_id === null ? isFirst : s.entry_id === entry.id)),
    [ofSection, isFirst, entry.id]
  );

  return (
    <PageEntryBody
      entry={entry}
      version={version}
      onEntryChange={onEntryChange}
      editors={editors.of(sectionId)}
      near={isNear}
      open={open?.sectionId === sectionId && open.entryId === entry.id}
      suggestions={suggestions}
      {...suggestionProps}
    />
  );
};

export default BodySlot;
