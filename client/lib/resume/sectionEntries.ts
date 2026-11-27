import { normalizeContent } from "@/components/resume/documentContent";
import { SectionEntry, SectionFields } from "@/lib/types";

/** Works on plain-HTTP pages too, where crypto.randomUUID doesn't exist. */
export const newEntryId = () =>
  `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export const emptyEntry = (): SectionEntry => ({
  id: newEntryId(),
  title: "",
  description: null,
  description_off: false,
  content: "",
  hidden: false,
  role: null,
  organization: null,
  location: null,
  start_date: null,
  end_date: null,
  current: false,
});

export const cleanLine = (value: string | null) => value?.replace(/\s+/g, " ").trim() || null;

/** As the server does, so that storing it isn't a change: an empty bullet alone is no content. */
const cleanContent = (html: string) =>
  html.replace(/<[^>]+>|&nbsp;/g, " ").trim() ? normalizeContent(html) : "";

/** The entry as the server stores it, with its fields in a fixed order. */
const cleanEntry = (entry: SectionEntry): SectionEntry => ({
  id: entry.id,
  title: cleanLine(entry.title) ?? "",
  description: entry.description?.trim() || null,
  description_off: Boolean(entry.description_off && entry.description?.trim()),
  content: cleanContent(entry.content),
  hidden: entry.hidden,
  role: cleanLine(entry.role),
  organization: cleanLine(entry.organization),
  location: cleanLine(entry.location),
  start_date: entry.start_date,
  end_date: entry.current ? null : entry.end_date,
  current: entry.current,
});

export const cleanFields = (sectionType: string, entries: SectionEntry[]): SectionFields => ({
  section_type: sectionType.trim() || "Section",
  entries: entries.map(cleanEntry),
});

/** Nothing has been written in it. */
export const isEmptyEntry = (entry: SectionEntry) =>
  Object.values({ ...cleanEntry(entry), id: "", hidden: false, description_off: false }).every((value) => !value);

/** The entry a section's heading adds a bullet or paragraph into: its first that shows and has text, else its first. */
export const entryUnderHeading = <T extends SectionEntry>(entries: T[]): T | undefined =>
  entries.find((entry) => !entry.hidden && !isEmptyEntry(entry)) ?? entries[0];

/** "YYYY-MM-DD" strings compare correctly as text. */
export const endsBeforeStart = (entry: SectionEntry) =>
  !entry.current && Boolean(entry.start_date && entry.end_date) && entry.end_date! < entry.start_date!;

/** Swaps the one at `from` with its neighbour above (-1) or below (1). */
export const moveAt = <T>(list: T[], from: number, by: -1 | 1): T[] => {
  const to = from + by;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};

export const moveEntry = (entries: SectionEntry[], id: string, by: -1 | 1): SectionEntry[] =>
  moveAt(entries, entries.findIndex((entry) => entry.id === id), by);

/** "ARC 360, Texmo Industries", or "" when no entry has a title. */
export const entryTitles = ({ entries }: Pick<SectionFields, "entries">) =>
  entries.map((entry) => entry.title.trim()).filter(Boolean).join(", ");
