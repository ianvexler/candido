"use client";

import type { EntryEditor, SectionChange } from "@/lib/resume/sectionDrafts";
import type { CvSuggestion, SectionEntry } from "@/lib/types";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { EntryChange, OnEntryChange } from "../useEntryEditor";
import type { Added } from "../useAdded";
import { fieldOf, SuggestionProps, useEntrySuggestions } from "../useEntrySuggestions";
import { entryKey, NearStore } from "./nearStore";
import type { PageEditors } from "./pageEditors";
import PageEntryBody from "./PageEntryBody";

// What is added to write the content in.
const BODY: Added["what"][] = ["section", "entry", "bullet"];

/** The drafts' change. */
export type OnSectionChange = (id: number, change: SectionChange, editor?: EntryEditor) => void;

export type Bodies = SuggestionProps & {
  onSectionChange: OnSectionChange;
  editors: PageEditors;
  near: NearStore;
  /** See PagedCv. */
  open: Added | null;
  suggestionsBySection?: Map<number, CvSuggestion[]>;
};

export const BodiesContext = createContext<Bodies | null>(null);

export const changeEntry = (
  onSectionChange: OnSectionChange,
  sectionId: number,
  entryId: string,
  changes: EntryChange,
  version?: number,
  gone?: boolean
) =>
  onSectionChange(
    sectionId,
    (current) => ({
      entries: current.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...(typeof changes === "function" ? changes(entry) : changes) } : entry
      ),
    }),
    version === undefined ? undefined : { entryId, version, gone }
  );

interface SummaryCardProps extends SuggestionProps {
  sectionId: number;
  entry: SectionEntry;
  version: number;
  onEntryChange: OnEntryChange;
  editors: ReturnType<PageEditors["of"]>;
}

/** A summary's suggestion, under its line. Nothing in the page. */
const SummaryCard = ({ sectionId, ...body }: SummaryCardProps) => {
  const entryId = body.entry.id;
  const descriptionRef = useMemo(
    () => ({
      get current() {
        return document.querySelector<HTMLElement>(
          `[data-section-id="${sectionId}"] [data-entry-id="${CSS.escape(entryId)}"] .rc-summary`
        );
      },
    }),
    [sectionId, entryId]
  );
  return useEntrySuggestions({ ...body, editor: null, summaryOff: false, descriptionRef }).card;
};

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
    (id: string, changes: EntryChange, from?: number, gone?: boolean) =>
      changeEntry(onSectionChange, sectionId, id, changes, from, gone),
    [onSectionChange, sectionId]
  );
  const ofSection = suggestionsBySection?.get(sectionId);
  const suggestions = useMemo(
    () => ofSection?.filter((s) => (s.entry_id === null ? isFirst : s.entry_id === entry.id)),
    [ofSection, isFirst, entry.id]
  );

  const summarySuggestion = suggestions?.find(
    (s) => s.id === suggestionProps.activeSuggestionId && fieldOf(s) === "description"
  );
  const body = { entry, version, onEntryChange, editors: editors.of(sectionId), ...suggestionProps };

  return (
    <>
      <PageEntryBody
        {...body}
        near={isNear}
        open={open !== null && BODY.includes(open.what) && open.sectionId === sectionId && open.entryId === entry.id}
        suggestions={suggestions}
      />
      {summarySuggestion && !entry.description_off && (
        <SummaryCard {...body} sectionId={sectionId} suggestions={[summarySuggestion]} />
      )}
    </>
  );
};

export default BodySlot;
