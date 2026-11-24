import type { TransferValue } from "@/api/resources/curriculums/transferWithLibrary";
import { CurriculumSection, EntryFieldKeys, EntryFields, SUMMARY_ID, SectionEntry, SectionFields } from "@/lib/types";
import { listItems, replaceItem, sameMarkup } from "./items";
import type { SectionDraft, SectionPatch } from "./sectionDrafts";

/** One item (SUMMARY_ID: the description), or an entry's own fields. */
export type TransferSubject = { entryId: string; itemId?: string };
export type TransferTarget = TransferSubject & { sectionId: number };

const fieldsOf = (entry: SectionEntry): Partial<EntryFields> =>
  Object.fromEntries(EntryFieldKeys.filter((key) => key in entry).map((key) => [key, entry[key]]));

/**
 * What a section has, as the server compares it. `anywhere` is for the library,
 * where an item counts whichever entry it is in.
 */
export const valueIn = (
  section: Pick<SectionFields, "entries"> | undefined,
  { entryId, itemId }: TransferSubject,
  anywhere = false
): TransferValue => {
  const entries = section?.entries ?? [];
  const entry = entries.find(({ id }) => id === entryId);
  if (itemId === undefined) return entry ? fieldsOf(entry) : null;
  if (itemId === SUMMARY_ID) return entry?.description?.trim() || null;

  const searched = anywhere ? entries : entry ? [entry] : [];
  const items = searched.flatMap(({ content }) => listItems(content));
  return items.find(({ id }) => id === itemId)?.html ?? null;
};

/** Whether the subject's text is the same in both. Ticks don't count. */
export const sameText = (a: SectionDraft, b: SectionDraft, subject: TransferSubject): boolean => {
  const [first, second] = [valueIn(a, subject), valueIn(b, subject)];
  if (first === null || second === null || subject.itemId === SUMMARY_ID) return first === second;
  if (typeof first === "string" && typeof second === "string") return sameMarkup(first, second);
  return JSON.stringify(first) === JSON.stringify(second);
};

const isListItem = (html: string) => /^<li\b/i.test(html);

/**
 * Puts what the server pulled from the library into a section edited since it
 * was asked to. Text edited meanwhile stays.
 */
export const pullInto = (
  latest: SectionDraft,
  before: SectionDraft,
  pulled: Pick<CurriculumSection, "entries">,
  subject: TransferSubject
): SectionPatch => {
  const { entryId, itemId } = subject;
  const [shown, sent, next] = [latest, before, pulled].map(({ entries }) => entries.find(({ id }) => id === entryId));
  const value = valueIn(pulled, subject);
  if (!shown || !sent || !next || value === null || !sameText(before, latest, subject)) return {};

  const withChanges = (changes: Partial<SectionEntry>): SectionPatch => ({
    entries: latest.entries.map((entry) => (entry === shown ? { ...entry, ...changes } : entry)),
  });
  if (typeof value !== "string") return withChanges(value);
  if (itemId === undefined) return {};
  if (itemId === SUMMARY_ID) return withChanges({ description: value });
  if (shown.content === sent.content) return withChanges({ content: next.content });

  const old = valueIn(latest, subject);
  // One that becomes another kind of block moves, which is the server's work.
  if (typeof old !== "string" || isListItem(old) !== isListItem(value)) return {};
  return withChanges({ content: replaceItem(shown.content, itemId, value) });
};
