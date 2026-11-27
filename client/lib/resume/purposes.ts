import { SUMMARY_ID, CvLabel, SectionEntry, SectionTemplate } from "@/lib/types";
import { entryTitle } from "./checklist";
import { listItems } from "./items";

/**
 * Which purpose each part of a library section is for. An entry or item with no
 * labels fits every purpose. Mirrors the server's CvPurpose; both are checked
 * against purposeFitCases.json (a copy of backend/spec/fixtures/purpose_fit_cases.json).
 */
export type PurposeFilter = { kind: "all" } | { kind: "label"; id: number } | { kind: "none" };

export type OutlineSection = {
  id: number;
  name: string;
  count: number;
  /** `title` is what to show; `name` is the entry's own title, which may be blank. */
  entries: { id: string; title: string; name: string; count: number }[];
};

type Labelled = Pick<SectionTemplate, "entries" | "item_labels">;

const NO_LABELS: number[] = [];

/** Own: the labels on the item (or on the entry, with no item). Inherited: its entry's. */
export const labelsOf = (
  template: Pick<SectionTemplate, "item_labels">,
  entryId: string,
  itemId?: string
): { own: number[]; inherited: number[] } => {
  const labels = template.item_labels ?? {};
  const entry = labels[entryId] ?? NO_LABELS;
  if (itemId === undefined) return { own: entry, inherited: NO_LABELS };
  // A summary has no labels of its own; its id repeats across entries.
  return { own: itemId === SUMMARY_ID ? NO_LABELS : (labels[itemId] ?? NO_LABELS), inherited: entry };
};

const CACHE_SIZE = 3000;
const parsed = new Map<string, string[]>();

/** The ids of an entry's items, in order. Items that have none yet are left out, as on the server. */
const itemIds = (entry: SectionEntry): string[] => {
  const content = entry.content ?? "";
  const known = parsed.get(content);
  if (known) return known;

  if (parsed.size >= CACHE_SIZE) parsed.clear();
  const ids = listItems(content)
    .map((item) => item.id)
    .filter((id) => id !== "");
  parsed.set(content, ids);
  return ids;
};

const fits = (labels: number[], labelId: number | null) => labels.length === 0 || labels.includes(labelId as number);

export const itemFits = (template: Labelled, entryId: string, itemId: string, labelId: number | null): boolean => {
  if (labelId === null) return true;
  const { own, inherited } = labelsOf(template, entryId, itemId);
  return fits([...own, ...inherited], labelId);
};

const entryOf = (template: Labelled, entryId: string) => template.entries.find((entry) => entry.id === entryId);

/** One of its items fits, or with no items its own labels do. Its summary doesn't count. */
export const entryFits = (template: Labelled, entryId: string, labelId: number | null): boolean => {
  if (labelId === null) return true;
  const entry = entryOf(template, entryId);
  const ids = entry ? itemIds(entry) : [];
  if (ids.length === 0) return fits(labelsOf(template, entryId).own, labelId);
  return ids.some((id) => itemFits(template, entryId, id, labelId));
};

export const sectionFits = (template: Labelled, labelId: number | null): boolean =>
  labelId === null || template.entries.some((entry) => entryFits(template, entry.id, labelId));

/** Whether an item shows under a filter. "none" is no own or inherited labels. */
export const inFilter = (template: Labelled, entryId: string, itemId: string, filter: PurposeFilter): boolean => {
  if (filter.kind === "all") return true;
  if (filter.kind === "label") return itemFits(template, entryId, itemId, filter.id);
  const { own, inherited } = labelsOf(template, entryId, itemId);
  return own.length === 0 && inherited.length === 0;
};

/** An entry with no items counts as one, and stands for itself. */
const entryCount = (template: Labelled, entry: SectionEntry, filter: PurposeFilter): number => {
  const ids = itemIds(entry);
  if (ids.length === 0) return inFilter(template, entry.id, "", filter) ? 1 : 0;
  return ids.filter((id) => inFilter(template, entry.id, id, filter)).length;
};

const sectionCount = (template: Labelled, filter: PurposeFilter) =>
  template.entries.reduce((total, entry) => total + entryCount(template, entry, filter), 0);

const memo = new WeakMap<object, WeakMap<object, Map<string, unknown>>>();

/** Results for this templates array and labels array, until either changes. */
const memoised = <T>(templates: SectionTemplate[], labels: CvLabel[], key: string, compute: () => T): T => {
  let byLabels = memo.get(templates);
  if (!byLabels) memo.set(templates, (byLabels = new WeakMap()));
  let results = byLabels.get(labels);
  if (!results) byLabels.set(labels, (results = new Map()));
  if (results.has(key)) return results.get(key) as T;

  const result = compute();
  results.set(key, result);
  return result;
};

/** Items in each purpose: "all", "none" and each label. Entries with no items count as one. */
export const purposeCounts = (templates: SectionTemplate[], labels: CvLabel[]): Map<"all" | "none" | number, number> =>
  memoised(templates, labels, "counts", () => {
    const counts = new Map<"all" | "none" | number, number>();
    const filters: [("all" | "none" | number), PurposeFilter][] = [
      ["all", { kind: "all" }],
      ["none", { kind: "none" }],
      ...labels.map((label): [number, PurposeFilter] => [label.id, { kind: "label", id: label.id }]),
    ];
    filters.forEach(([key, filter]) => {
      counts.set(key, templates.reduce((total, template) => total + sectionCount(template, filter), 0));
    });
    return counts;
  });

/** Items that carry this label, their own or their entry's. An entry with no items counts as one. */
export const carryingCount = (templates: Labelled[], labelId: number): number =>
  templates.reduce(
    (total, template) =>
      total +
      template.entries.reduce((sum, entry) => {
        const ids = itemIds(entry);
        if (ids.length === 0) return sum + (labelsOf(template, entry.id).own.includes(labelId) ? 1 : 0);
        return (
          sum +
          ids.filter((id) => {
            const { own, inherited } = labelsOf(template, entry.id, id);
            return own.includes(labelId) || inherited.includes(labelId);
          }).length
        );
      }, 0),
    0
  );

const matches = (text: string | null | undefined, query: string) => (text ?? "").toLowerCase().includes(query);

const entryTexts = (entry: SectionEntry) => [entry.title, entry.organization, entry.role, entry.description];

const ordered = (templates: SectionTemplate[]) =>
  [...templates].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);

const outlineEntry = (template: SectionTemplate, entry: SectionEntry, filter: PurposeFilter) => {
  const count = entryCount(template, entry, filter);
  if (count === 0) return null;
  return { id: entry.id, title: entryTitle(entry, listItems(entry.content ?? "")[0]), name: entry.title ?? "", count };
};

/**
 * The library as sections and entries, in library order, with only what is in
 * the filter. A query keeps the entries whose own text or items match, or all of
 * a section whose name does.
 */
export const outline = (templates: SectionTemplate[], filter: PurposeFilter, query: string): OutlineSection[] => {
  const needle = query.trim().toLowerCase();

  return ordered(templates).flatMap((template) => {
    const sectionMatches = needle === "" || matches(template.section_type, needle);
    const entries = template.entries.flatMap((entry) => {
      const shown = outlineEntry(template, entry, filter);
      if (!shown) return [];
      const found =
        sectionMatches ||
        entryTexts(entry).some((text) => matches(text, needle)) ||
        matches(shown.title, needle) ||
        listItems(entry.content ?? "").some((item) => matches(item.text, needle));
      return found ? [shown] : [];
    });
    if (entries.length === 0) return [];

    return [{ id: template.id, name: template.section_type, count: entries.reduce((n, e) => n + e.count, 0), entries }];
  });
};
