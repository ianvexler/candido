import { CurriculumSection, CvSuggestion, EntryFieldKeys, SUMMARY_ID, SectionEntry, SectionTemplate } from "@/lib/types";
import { Item, isSeparator, listItems, parseHtml, setItemsOff, withoutBlankEnd } from "./items";
import { FieldDifference, ItemState, actionsFor, differingFields, fieldsState, itemState, shownText, summaryState } from "./itemState";
import { hasVisibleText } from "@/components/resume/documentContent";
import { hasDetails } from "@/components/resume/sectionDetails";
import { isEmptyEntry, moveAt } from "./sectionEntries";
import { sameFields, type SectionDraft, type SectionPatch } from "./sectionDrafts";
import { isLeftOut } from "./exportDocument";
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
  /** What the CV shows of it, if some is hidden. */
  shownText: string | null;
  /** False for library content that the CV has no copy of. */
  inCv: boolean;
  /** Its own tick; see `ticked`. */
  off: boolean;
  ticked: boolean;
  isNew: boolean;
  state: ItemState;
  /** When both sides have it and differ. */
  libraryText: string | null;
};

export type ChecklistEntry = Counts & {
  id: string;
  inCv: boolean;
  title: string;
  /** Its own tick; see `ticked`. */
  hidden: boolean;
  isNew: boolean;
  fieldsState: ItemState;
  /** When both sides have it. */
  differences: FieldDifference[];
  /** Nothing is written in it. */
  blank: boolean;
  /** Which of its fields are filled in. */
  has: { title: boolean; summary: boolean; details: boolean };
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
const shownOf = cached(shownText);

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
type Held = {
  entries: Set<string>;
  items: Set<string>;
};

const heldIn = (copies: CurriculumSection[]): Held => {
  const entries = copies.flatMap((copy) => copy.entries);
  return {
    entries: new Set(entries.map(({ id }) => id)),
    items: new Set(entries.flatMap(({ content }) => itemsOf(content).map(({ id }) => id))),
  };
};

const summaryOf = (entry: SectionEntry | undefined) => entry?.description?.trim() || null;

/** An entry's description, as its first item; none if neither side has it. */
const buildSummary = (
  section: CurriculumSection | null,
  entry: SectionEntry | null,
  libraryEntry: SectionEntry | undefined,
  entryTicked: boolean
): ChecklistItem[] => {
  const ours = summaryOf(entry ?? undefined);
  const theirs = summaryOf(libraryEntry);
  const text = ours ?? theirs;
  if (text === null) return [];

  const state = summaryState(ours, theirs, (entry && section?.base_fields[entry.id]?.description?.trim()) || null);
  const off = ours === null || Boolean(entry?.description_off);
  return [
    {
      id: SUMMARY_ID,
      text,
      shownText: null,
      inCv: ours !== null,
      off,
      ticked: entryTicked && !off,
      isNew: false,
      state,
      libraryText: ours !== null && state !== "same" ? theirs : null,
    },
  ];
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

  const own = (inCv ? itemsOf(entry.content) : []).map((item): ChecklistItem => {
    const theirs = library.items.get(item.id);
    const state = stateOf(item.html, theirs?.html ?? null, section?.base_items[item.id] ?? null);
    return {
      id: item.id,
      text: item.text,
      shownText: shownOf(item.html),
      inCv: true,
      off: item.off,
      ticked: ticked && !item.off,
      isNew: false,
      state,
      libraryText: theirs && state !== "same" ? theirs.text : null,
    };
  });
  const libraryItems = withLibrary && libraryEntry ? itemsOf(libraryEntry.content) : [];
  const extras = libraryItems
    .filter(({ id }) => id !== "" && !held.items.has(id))
    .map(({ id, text }): ChecklistItem => ({
      id,
      text,
      shownText: null,
      inCv: false,
      off: true,
      ticked: false,
      isNew: library.isNew(id),
      state: "library_only",
      libraryText: null,
    }));
  const offersSummary = !inCv || summaryOf(entry) !== null || withLibrary;
  const summary = buildSummary(section, inCv ? entry : null, offersSummary ? libraryEntry : undefined, ticked);
  const items = [...summary, ...withLibraryOnly(own, libraryItems.map(({ id }) => id), extras)];

  const blank = isEmptyEntry(entry);
  const countsItself = items.length === 0 && !blank;
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
    differences: inCv && libraryEntry ? differingFields(entry, libraryEntry) : [],
    blank,
    has: {
      title: Boolean(entry.title.trim()),
      summary: summaryOf(entry) !== null,
      details: hasDetails(entry),
    },
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

// The state a row offers something about, if any; see actionsFor.

const offerFor = (state: ItemState) => (actionsFor(state).length > 0 ? state : null);

/** About an entry's fields, or all of it if the library lacks it. */
export const entryOffer = ({ inCv, blank, fieldsState: state }: ChecklistEntry): ItemState | null =>
  inCv && !blank ? offerFor(state) : null;

/** Adding an entry adds its items, so they don't offer that too. */
export const itemOffer = (entry: ChecklistEntry, { id, state }: ChecklistItem): ItemState | null => {
  const addedWithEntry = state === "cv_only" && entry.fieldsState === "cv_only";
  return id === "" || addedWithEntry ? null : offerFor(state);
};

// Ticking, for content the CV has; the server's include_from_library! copies in
// the rest. Both show only the ticked part of a left out section or entry. Only
// these tick everything when nothing was ticked: the server leaves ticks alone.

const setOff = (entry: SectionEntry, ids: string[], off: boolean): SectionEntry => ({
  ...entry,
  content: setItemsOff(entry.content, ids, off),
  ...(ids.includes(SUMMARY_ID) && { description_off: off }),
});

const tickable = (entry: SectionEntry): { id: string; off: boolean }[] => [
  ...(summaryOf(entry) ? [{ id: SUMMARY_ID, off: Boolean(entry.description_off) }] : []),
  ...itemsOf(entry.content),
];

const allIds = (entry: SectionEntry) => tickable(entry).map(({ id }) => id);

const allOff = (entry: SectionEntry) => {
  const items = tickable(entry);
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

/** Left out if only its items would show and none are ticked: it would leave a bare heading. */
const leaveOutBare = (entry: SectionEntry): SectionEntry =>
  !hasFields(entry) && allOff(entry) && !hasVisibleText(entry.content) ? hideEntry(entry) : entry;

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
    const left = leaveOutBare(setOff(target, [itemId], true));
    const entries = section.entries.map((entry) => (entry === target ? left : entry));
    const shows = entries.some((entry) => !entry.hidden && !isEmptyEntry(entry));
    // Blank entries would still show the section's heading.
    return left.hidden && !shows ? { hidden: true, entries } : { entries };
  }
  return showOnly(section, entryId, (entry) => {
    const others = section.hidden || entry.hidden ? allIds(entry).filter((id) => id !== itemId) : [];
    return setOff(others.length > 0 ? setOff(entry, others, true) : entry, [itemId], false);
  });
};

// Adding. As with ticking, only what is added shows of a left out section or entry.

/** A new entry, after the CV's others. */
export const addEntry = (section: SectionDraft, entry: SectionEntry): SectionPatch => ({
  hidden: false,
  entries: [...(section.hidden ? section.entries.map(hideEntry) : section.entries), entry],
});

/** Puts an entry after another, or first for null, as addEntry does. */
export const insertEntry = (section: SectionDraft, afterEntryId: string | null, entry: SectionEntry): SectionPatch => {
  const entries = section.hidden ? section.entries.map(hideEntry) : section.entries;
  const index = afterEntryId === null ? -1 : entries.findIndex(({ id }) => id === afterEntryId);
  // One that is gone since goes last.
  const at = afterEntryId !== null && index < 0 ? entries.length : index + 1;
  return { hidden: false, entries: [...entries.slice(0, at), entry, ...entries.slice(at)] };
};

/** Shows an entry for a bullet that is added to it. */
export const showForBullet = (section: SectionDraft, entryId: string): SectionPatch => {
  const target = section.entries.find(({ id }) => id === entryId);
  if (!target || (!section.hidden && !target.hidden)) return {};
  return showOnly(section, entryId, (entry) => setOff(entry, allIds(entry), true));
};

/** Without an empty bullet in an entry, which goes once it is left. */
const withoutBlank = (section: SectionDraft, entryId: string): SectionDraft => ({
  ...section,
  entries: section.entries.map((entry) =>
    entry.id === entryId ? { ...entry, content: withoutBlankEnd(entry.content) } : entry
  ),
});

/** Ticks as they were before adding to an entry, if nothing else changed since. */
export const putBack = (before: SectionDraft, after: SectionDraft, entryId: string) => (section: SectionDraft): SectionPatch =>
  section.hidden === after.hidden && sameFields(withoutBlank(section, entryId), withoutBlank(after, entryId))
    ? { hidden: before.hidden, entries: before.entries }
    : {};

/** Whether a section's heading, or an entry, or an item of it, is in the CV. What isn't there at all is as its entry. */
export const isIn = (section: SectionDraft, entryId?: string, itemId?: string): boolean => {
  if (entryId === undefined) return !isLeftOut({ ...section, hidden: Boolean(section.hidden) });
  const entry = section.entries.find(({ id }) => id === entryId);
  if (!entry || section.hidden || entry.hidden) return false;
  return !tickable(entry).some(({ id, off }) => id === itemId && off);
};

/** Section ids in their new order; entries move with moveEntry. */
export const moveSection = (ids: number[], id: number, by: -1 | 1): number[] => moveAt(ids, ids.indexOf(id), by);

/** Section ids with one put after another, or first for null. Null if that changes nothing, or the other is gone. */
export const placeSection = (ids: number[], id: number, afterId: number | null): number[] | null => {
  const others = ids.filter((each) => each !== id);
  const at = afterId === null ? 0 : others.indexOf(afterId) + 1;
  if (afterId !== null && at === 0) return null;
  const placed = [...others.slice(0, at), id, ...others.slice(at)];
  return placed.join() === ids.join() ? null : placed;
};

/** What was just added: a section, or an entry or items that weren't known. */
type Kept = { sectionId: number; entryId: string | null; known: string[] };

/** What matches, in its section and entry, all of a section or entry whose name does, and what is kept. */
export const filterChecklist = (list: ChecklistSection[], query: string, keep: Kept | null = null): ChecklistSection[] => {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return list;
  const matches = (text: string) => text.toLowerCase().includes(wanted);

  return list.flatMap((section) => {
    const kept = keep !== null && section.sectionId === keep.sectionId ? keep : null;
    if (matches(section.name) || kept?.entryId === null) return [section];
    const entries = section.entries.flatMap((entry) => {
      if (matches(entry.title)) return [entry];
      const isKept = entry.inCv && kept?.entryId === entry.id;
      const items = entry.items.filter(({ id, text }) => matches(text) || (isKept && !kept.known.includes(id)));
      return items.length > 0 || isKept ? [{ ...entry, items }] : [];
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

type Quoting = Pick<CvSuggestion, "entry_id" | "field" | "quote">;

// Reviews from before sections had entries are about the first one.
const entryOf = ({ entries }: SectionDraft, { entry_id }: Quoting) =>
  entry_id === null ? entries[0] : entries.find(({ id }) => id === entry_id);

const quotesIn = ({ quote }: Quoting) => (text: string) => findQuote(text, quote) !== null;

const quotedItems = (entry: SectionEntry, suggestion: Quoting) =>
  itemsOf(entry.content).filter(({ html }) => runsOf(html).some(quotesIn(suggestion)));

/** Where the text a suggestion quotes is now. */
export const suggestionPlace = (section: SectionDraft, suggestion: Quoting): "visible" | "left_out" | "stale" => {
  const entry = entryOf(section, suggestion);
  if (!entry) return "stale";

  const shown = section.hidden || entry.hidden ? "left_out" : "visible";
  if (suggestion.field === "description") {
    if (!quotesIn(suggestion)(entry.description ?? "")) return "stale";
    return entry.description_off ? "left_out" : shown;
  }

  const found = quotedItems(entry, suggestion);
  if (found.length === 0) return "stale";
  return found.some(({ off }) => !off) ? shown : "left_out";
};

/** Shows the left out text a suggestion quotes. Nothing changes if it's gone. */
export const tickSuggestion = (section: SectionDraft, suggestion: Quoting): SectionPatch => {
  const entry = entryOf(section, suggestion);
  if (!entry || suggestionPlace(section, suggestion) !== "left_out") return {};
  if (suggestion.field === "description") return tickItem(section, entry.id, SUMMARY_ID, true);

  const found = quotedItems(entry, suggestion);
  return tickItem(section, entry.id, (found.find(({ off }) => !off) ?? found[0]).id, true);
};
