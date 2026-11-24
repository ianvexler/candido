import { CurriculumSection, CvSuggestion, EntryFieldKeys, SectionEntry, SectionTemplate } from "@/lib/types";
import { Item, isSeparator, listItems, parseHtml, setItemsOff } from "./items";
import { ItemState, fieldsState, itemState } from "./itemState";
import { isEmptyEntry, moveAt } from "./sectionEntries";
import type { SectionDraft, SectionPatch } from "./sectionDrafts";
import { findQuote } from "./suggestions";

/** "partial": some of it, or only an entry's title line. */
export type TickState = "on" | "off" | "partial";

type Counts = {
  /** In the CV as it stands: nothing in an unticked section or entry is. */
  ticked: boolean;
  state: TickState;
  /** Items, and entries without any unless they are blank. */
  total: number;
  /** How many of those the CV shows. */
  included: number;
};

export type ChecklistItem = {
  id: string;
  text: string;
  /** False for library content that the CV has no copy of. */
  inCv: boolean;
  /** Its own tick; see `ticked`. */
  off: boolean;
  ticked: boolean;
  isNew: boolean;
  state: ItemState;
};

export type ChecklistEntry = Counts & {
  id: string;
  inCv: boolean;
  title: string;
  /** Its own tick; see `ticked`. */
  hidden: boolean;
  isNew: boolean;
  fieldsState: ItemState;
  items: ChecklistItem[];
};

export type ChecklistSection = Counts & {
  key: string;
  /** Null for a library section the CV has no copy of. */
  sectionId: number | null;
  templateId: number | null;
  name: string;
  hidden: boolean;
  isNew: boolean;
  entries: ChecklistEntry[];
};

// Room for a large library and CV together. Starting over is a rebuild's work.
const CACHE_SIZE = 3000;

/** Remembers results: the checklist is rebuilt on every keystroke, and parsing is slow. */
const cached = <A extends (string | null)[], T>(compute: (...args: A) => T) => {
  const results = new Map<string, T>();
  return (...args: A): T => {
    const key = args.map((arg) => arg ?? "\u0001").join("\u0000");
    const known = results.get(key);
    if (known !== undefined) return known;

    if (results.size >= CACHE_SIZE) results.clear();
    const result = compute(...args);
    results.set(key, result);
    return result;
  };
};

const itemsOf = cached((html: string): readonly Item[] => listItems(html));
const stateOf = cached(itemState);

/** `ours`, with what only the library has after its nearest earlier neighbour, or first. */
const withLibraryOnly = <T extends { id: string }>(ours: T[], libraryIds: string[], extras: T[]): T[] => {
  const rows = [...ours];
  libraryIds.forEach((id, index) => {
    const extra = extras.find((row) => row.id === id);
    if (!extra) return;
    const earlier = libraryIds.slice(0, index).reverse();
    const neighbour = earlier.find((other) => rows.some((row) => row.id === other));
    rows.splice(rows.findIndex((row) => row.id === neighbour) + 1, 0, extra);
  });
  return rows;
};

const entryTitle = (entry: SectionEntry, firstItem: ChecklistItem | undefined) =>
  [entry.title, entry.organization, entry.role, firstItem?.text].map((text) => text?.trim()).find(Boolean) ?? "Untitled";

const tickState = (ticked: boolean, included: number, total: number): TickState => {
  if (!ticked) return "off";
  return included === total ? "on" : "partial";
};

const sum = (entries: ChecklistEntry[], key: "total" | "included") =>
  entries.reduce((count, entry) => count + entry[key], 0);

/** Looks up what a library section has, and whether it is newer than the CV. */
const readLibrary = (template: SectionTemplate | undefined, cvCreatedAt: Date | string) => {
  const entries = template?.entries ?? [];
  const items = new Map(
    entries.flatMap((entry) => itemsOf(entry.content).map((item) => [item.id, item] as const))
  );
  // What the library hasn't given an id yet can't be told apart or copied.
  items.delete("");
  return {
    entries,
    items,
    isNew: (id: string) => {
      const added = template?.item_added_at[id];
      return added !== undefined && new Date(added) > new Date(cvCreatedAt);
    },
  };
};

type Library = ReturnType<typeof readLibrary>;

/** Ids of what a CV has of one library section, in any copy of it. */
type Held = { entries: Set<string>; items: Set<string> };

const heldIn = (copies: CurriculumSection[]): Held => {
  const entries = copies.flatMap((copy) => copy.entries);
  return {
    entries: new Set(entries.map(({ id }) => id)),
    items: new Set(entries.flatMap(({ content }) => itemsOf(content).map(({ id }) => id))),
  };
};

const buildEntry = (
  section: CurriculumSection | null,
  library: Library,
  entry: SectionEntry,
  inCv: boolean,
  held: Held,
  withLibrary: boolean
): ChecklistEntry => {
  const libraryEntry = library.entries.find(({ id }) => id === entry.id);
  const ticked = inCv && !section?.hidden && !entry.hidden;

  const own = (inCv ? itemsOf(entry.content) : []).map((item): ChecklistItem => ({
    id: item.id,
    text: item.text,
    inCv: true,
    off: item.off,
    ticked: ticked && !item.off,
    isNew: false,
    state: stateOf(item.html, library.items.get(item.id)?.html ?? null, section?.base_items[item.id] ?? null),
  }));
  const libraryItems = withLibrary && libraryEntry ? itemsOf(libraryEntry.content) : [];
  const extras = libraryItems
    .filter(({ id }) => id !== "" && !held.items.has(id))
    .map(({ id, text }): ChecklistItem => ({
      id,
      text,
      inCv: false,
      off: true,
      ticked: false,
      isNew: library.isNew(id),
      state: "library_only",
    }));
  const items = withLibraryOnly(own, libraryItems.map(({ id }) => id), extras);

  const countsItself = items.length === 0 && !isEmptyEntry(entry);
  const total = countsItself ? 1 : items.length;
  const included = countsItself ? Number(ticked) : items.filter((item) => item.ticked).length;
  return {
    id: entry.id,
    inCv,
    title: entryTitle(entry, own[0] ?? items[0]),
    hidden: inCv ? entry.hidden : true,
    ticked,
    state: tickState(ticked, included, total),
    isNew: !inCv && library.isNew(entry.id),
    total,
    included,
    fieldsState: fieldsState(inCv ? entry : null, libraryEntry ?? null, section?.base_fields[entry.id] ?? null),
    items,
  };
};

/** A CV's section, its library section, or both. */
const buildSection = (
  section: CurriculumSection | null,
  template: SectionTemplate | undefined,
  cvCreatedAt: Date | string,
  held: Held,
  withLibrary: boolean
): ChecklistSection => {
  const library = readLibrary(template, cvCreatedAt);
  const ours = section?.entries ?? [];
  const build = (entry: SectionEntry, inCv: boolean) => buildEntry(section, library, entry, inCv, held, withLibrary);

  const extras = withLibrary ? library.entries.filter(({ id }) => !held.entries.has(id)) : [];
  const entries = withLibraryOnly(
    ours.map((entry) => build(entry, true)),
    library.entries.map(({ id }) => id),
    extras.map((entry) => build(entry, false))
  );

  const total = sum(entries, "total");
  const included = sum(entries, "included");
  // Blank entries don't show, so they only leave a section its own tick.
  const written = ours.filter((entry) => !isEmptyEntry(entry));
  const ticked = section !== null && !section.hidden && (written.length === 0 || written.some((entry) => !entry.hidden));
  return {
    key: section ? `cv-${section.id}` : `library-${template?.id}`,
    sectionId: section?.id ?? null,
    templateId: section?.section_template_id ?? template?.id ?? null,
    name: (section ?? template)?.section_type ?? "",
    hidden: section?.hidden ?? true,
    ticked,
    state: tickState(ticked, included, total),
    isNew: entries.length > 0 && entries.every((entry) => entry.isNew),
    total,
    included,
    entries,
  };
};

/**
 * Everything the CV could show: its sections, in the CV's order, with what else
 * their library sections have; then the library sections it has no copy of.
 * The first of several copies of a library section lists what they lack.
 */
export const buildChecklist = (
  sections: CurriculumSection[],
  templates: SectionTemplate[],
  cvCreatedAt: Date | string
): ChecklistSection[] => {
  const held = (templateId: number | null) =>
    heldIn(sections.filter((section) => templateId !== null && section.section_template_id === templateId));
  const copied = new Set<number>();
  const ours = sections.map((section) => {
    const template = templates.find(({ id }) => id === section.section_template_id);
    const isFirst = template !== undefined && !copied.has(template.id);
    if (template) copied.add(template.id);
    return buildSection(section, template, cvCreatedAt, held(section.section_template_id), isFirst);
  });
  const others = templates
    .filter(({ id }) => !copied.has(id))
    .map((template) => buildSection(null, template, cvCreatedAt, held(template.id), true));
  return [...ours, ...others];
};

// Ticking, for content the CV has; the server's include_from_library! copies in
// the rest. Both show only the ticked part of a left out section or entry. Only
// these tick everything when nothing was ticked: the server leaves ticks alone.

const setOff = (entry: SectionEntry, ids: string[], off: boolean): SectionEntry => ({
  ...entry,
  content: setItemsOff(entry.content, ids, off),
});

const allIds = (entry: SectionEntry) => itemsOf(entry.content).map(({ id }) => id);

const allOff = (entry: SectionEntry) => {
  const items = itemsOf(entry.content);
  return items.length > 0 && items.every(({ off }) => off);
};

/** Shown with its earlier item ticks, or all of them. */
const showEntry = (entry: SectionEntry): SectionEntry => ({
  ...(allOff(entry) ? setOff(entry, allIds(entry), false) : entry),
  hidden: false,
});

const hideEntry = (entry: SectionEntry): SectionEntry => ({ ...entry, hidden: true });

const hasFields = (entry: SectionEntry) =>
  EntryFieldKeys.some((key) => (typeof entry[key] === "string" ? entry[key].trim() : entry[key]));

/** Has something ticked: items, or itself if it can do without. */
const hasTicks = (entry: SectionEntry) => !entry.hidden && !isEmptyEntry(entry) && (hasFields(entry) || !allOff(entry));

export const tickSection = (section: SectionDraft, on: boolean): SectionPatch => {
  if (!on) return { hidden: true };
  if (section.entries.some(hasTicks)) return { hidden: false };
  return { hidden: false, entries: section.entries.map(showEntry) };
};

/** Shows one entry as `change` gives it. In a left out section, the others become left out. */
const showOnly = (
  section: SectionDraft,
  entryId: string,
  change: (entry: SectionEntry) => SectionEntry
): SectionPatch => ({
  hidden: false,
  entries: section.entries.map((entry) => {
    if (entry.id === entryId) return { ...change(entry), hidden: false };
    return section.hidden ? hideEntry(entry) : entry;
  }),
});

/** Nothing changes if the entry isn't in the section anymore. */
export const tickEntry = (section: SectionDraft, entryId: string, on: boolean): SectionPatch => {
  if (!section.entries.some(({ id }) => id === entryId)) return {};
  if (on) return showOnly(section, entryId, showEntry);
  return { entries: section.entries.map((entry) => (entry.id === entryId ? hideEntry(entry) : entry)) };
};

/** Nothing changes if the item isn't in the entry anymore. */
export const tickItem = (section: SectionDraft, entryId: string, itemId: string, on: boolean): SectionPatch => {
  const target = section.entries.find(({ id }) => id === entryId);
  if (!itemId || !target || !allIds(target).includes(itemId)) return {};
  if (!on) {
    return { entries: section.entries.map((entry) => (entry === target ? setOff(entry, [itemId], true) : entry)) };
  }
  return showOnly(section, entryId, (entry) => {
    const others = section.hidden || entry.hidden ? allIds(entry).filter((id) => id !== itemId) : [];
    return setOff(others.length > 0 ? setOff(entry, others, true) : entry, [itemId], false);
  });
};

/** Section ids in their new order; entries move with moveEntry. */
export const moveSection = (ids: number[], id: number, by: -1 | 1): number[] => moveAt(ids, ids.indexOf(id), by);

/** What matches, in its section and entry, and all of a section or entry whose name does. */
export const filterChecklist = (list: ChecklistSection[], query: string): ChecklistSection[] => {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return list;
  const matches = (text: string) => text.toLowerCase().includes(wanted);

  return list.flatMap((section) => {
    if (matches(section.name)) return [section];
    const entries = section.entries.flatMap((entry) => {
      if (matches(entry.title)) return [entry];
      const items = entry.items.filter(({ text }) => matches(text));
      return items.length > 0 ? [{ ...entry, items }] : [];
    });
    return entries.length > 0 ? [{ ...section, entries }] : [];
  });
};

/** An item's text as the editor matches quotes in it: by block, and apart where text is hidden. */
const runsOf = cached((html: string): readonly string[] => {
  const runs = [""];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      runs[runs.length - 1] += node.textContent ?? "";
      return;
    }
    if (node.nodeName === "BR") {
      runs[runs.length - 1] += " ";
      return;
    }
    const hidden = node instanceof Element && node.matches("span[data-cv-hidden]");
    const apart = hidden || isSeparator(node);
    if (apart) runs.push("");
    if (!hidden) node.childNodes.forEach(visit);
    if (apart) runs.push("");
  };
  visit(parseHtml(html));
  return runs.filter((run) => run.trim());
});

/** Where the text a suggestion quotes is now. */
export const suggestionPlace = (
  section: SectionDraft,
  suggestion: Pick<CvSuggestion, "entry_id" | "field" | "quote">
): "visible" | "left_out" | "stale" => {
  // Reviews from before sections had entries are about the first one.
  const entry =
    suggestion.entry_id === null
      ? section.entries[0]
      : section.entries.find(({ id }) => id === suggestion.entry_id);
  if (!entry) return "stale";

  const quoted = (text: string) => findQuote(text, suggestion.quote) !== null;
  const shown = section.hidden || entry.hidden ? "left_out" : "visible";
  if (suggestion.field === "description") return quoted(entry.description ?? "") ? shown : "stale";

  const found = itemsOf(entry.content).filter(({ html }) => runsOf(html).some(quoted));
  if (found.length === 0) return "stale";
  return found.some(({ off }) => !off) ? shown : "left_out";
};
