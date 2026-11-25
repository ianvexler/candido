"use client";

import type { ExportEntry } from "@/lib/resume/exportDocument";
import { RefObject, useMemo } from "react";
import type { Added } from "../useAdded";
import BodySlot, { changeEntry, OnSectionChange } from "./BodySlot";
import { entryKey } from "./nearStore";
import { sourceOfEntry, sourceOfSection } from "./pageDocument";
import PageContact from "./PageContact";
import type { PageEditing, TextBinding } from "./PageEditing";
import PageLine from "./PageLine";
import type { HeaderBinding } from "./useHeaderBinding";

const FIELDS = '.page-text, .ProseMirror, .page-entry-body > [role="textbox"]';

/** Enter in a one-line field. */
const moveOn = (root: HTMLElement | null) => {
  const fields = [...(root?.querySelectorAll<HTMLElement>(FIELDS) ?? [])].filter((field) => field.getClientRects().length > 0);
  const next = fields[fields.findIndex((field) => field === document.activeElement) + 1];
  if (next) next.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
};

// Still an editing context, so that its blocks can be told apart and paged.
const NOTHING_EDITED: PageEditing = { text: () => null, line: () => null, body: () => null, contact: () => null };

interface PageEditingOptions {
  headerBinding: HeaderBinding | null;
  onSectionChange: OnSectionChange;
  readOnly: boolean;
  /** See PagedCv. */
  open: Added | null;
}

/** What makes the template on a page editable. Its sections' only changes as an empty field is opened. */
export const usePageEditing = (
  rootRef: RefObject<HTMLElement | null>,
  { headerBinding, onSectionChange, readOnly, open }: PageEditingOptions
): { sections: PageEditing; header: PageEditing } => {
  const header = useMemo<PageEditing>(() => {
    if (readOnly || !headerBinding) return NOTHING_EDITED;
    return {
      ...NOTHING_EDITED,
      text: (slot) => {
        const binding = "sectionId" in slot ? null : headerBinding.text(slot.kind);
        return binding && { ...binding, onEnter: () => moveOn(rootRef.current) };
      },
      contact: (headerShown, stacked) => <PageContact header={headerShown} stacked={stacked} />,
    };
  }, [rootRef, headerBinding, readOnly]);

  const opened = open && open.what !== "section" && open.what !== "bullet" ? open : null;
  const openField = opened?.what === "entry" ? "title" : opened?.what;
  const openIn = opened && entryKey(opened.sectionId, opened.entryId);
  const sections = useMemo<PageEditing>(() => {
    if (readOnly) return NOTHING_EDITED;
    const onEnter = () => moveOn(rootRef.current);
    return {
      ...NOTHING_EDITED,
      text: (slot, of) => {
        if (!of || !("sectionId" in slot)) return null;
        if (slot.kind === "heading") {
          const section = "entries" in of ? sourceOfSection(of) : undefined;
          if (!section) return null;
          return {
            value: section.section_type,
            label: "Section heading",
            required: true,
            onEnter,
            onChange: (section_type) => onSectionChange(slot.sectionId, { section_type }),
          };
        }
        const { sectionId, entryId } = slot;
        const entry = "entries" in of ? undefined : sourceOfEntry(of)?.entry;
        if (!entry) return null;
        const bind = (field: "title" | "description", label: string): TextBinding => ({
          value: entry[field] ?? "",
          label,
          open: field === (openField === "summary" ? "description" : openField) && openIn === entryKey(sectionId, entryId),
          placeholder: label,
          onEnter,
          onChange: (text) => changeEntry(onSectionChange, sectionId, entryId, { [field]: text }),
        });
        if (slot.kind === "title") return bind("title", "Title");
        // Left out, so it isn't on the page at all.
        return entry.description_off ? null : bind("description", "Summary");
      },
      line: (entryShown) => {
        const source = sourceOfEntry(entryShown);
        return source ? <PageLine entry={entryShown} sectionId={source.section.id} source={source.entry} /> : null;
      },
      body: (entryShown: ExportEntry) => {
        const source = sourceOfEntry(entryShown);
        if (!source) return null;
        const { section, entry, version } = source;
        return <BodySlot sectionId={section.id} isFirst={section.entries[0]?.id === entry.id} entry={entry} version={version} />;
      },
    };
  }, [rootRef, onSectionChange, readOnly, openField, openIn]);

  return { sections, header };
};
