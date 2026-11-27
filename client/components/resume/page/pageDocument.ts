import { buildResumeDocument, ExportEntry, ExportSection, KeptPlace } from "@/lib/resume/exportDocument";
import { itemsHidingText } from "@/lib/resume/items";
import type { EntryVersions } from "@/lib/resume/sectionDrafts";
import type { CurriculumSection, ResumeHeader, SectionEntry } from "@/lib/types";

/** What an entry on the page was made from. */
export type EntrySource = {
  section: CurriculumSection;
  entry: SectionEntry;
  version: number;
  /** Ids of its items with hidden text; see itemsHidingText. */
  hiding: string[];
};

type Built = { versions?: EntryVersions; kept: string; result: ExportSection[] };

const NO_HEADER: ResumeHeader = { name: "", headline: "", email: "", phone: "", location: "", links: [] };

// By the objects the templates get, so that what they ask for is what they show.
const entrySources = new WeakMap<ExportEntry, EntrySource>();
const sectionSources = new WeakMap<ExportSection, CurriculumSection>();

export const sourceOfEntry = (entry: ExportEntry) => entrySources.get(entry);
export const sourceOfSection = (section: ExportSection) => sectionSources.get(section);

/**
 * Builds the sections the page shows. One that didn't change is the same object
 * as before, so nothing of it is rendered again.
 */
export const createPageSections = () => {
  const built = new WeakMap<CurriculumSection, Built>();

  return (
    sections: CurriculumSection[],
    versions: Record<number, EntryVersions>,
    keep: KeptPlace[] = []
  ): ExportSection[] =>
    sections.flatMap((section) => {
      const keepHere = keep.filter((place) => place.sectionId === section.id);
      const kept = JSON.stringify(keepHere.map((place) => place.entryId));
      const before = built.get(section);
      if (before && before.versions === versions[section.id] && before.kept === kept) return before.result;

      const result = buildResumeDocument({ title: "", header: NO_HEADER, sections: [section], keep: keepHere }).sections;
      result.forEach((shown) => {
        sectionSources.set(shown, section);
        shown.entries.forEach((shownEntry) => {
          const entry = section.entries.find(({ id }) => id === shownEntry.id)!;
          entrySources.set(shownEntry, {
            section,
            entry,
            version: versions[section.id]?.[entry.id] ?? 0,
            hiding: itemsHidingText(entry.content),
          });
        });
      });
      built.set(section, { versions: versions[section.id], kept, result });
      return result;
    });
};
