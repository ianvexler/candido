import { createContext } from "react";
import type { CurriculumSection } from "@/lib/types";
import { fromMonthInput } from "@/components/resume/sectionDetails";

/** An entry's months as typed. */
export type TypedMonths = { start: string; end: string };
type Place = { sectionId: number; entryId: string };

const isHalf = (month: string) => month !== "" && fromMonthInput(month) === null;

/** Holds half-typed months, which aren't dates yet, while what shows them changes. */
export const createMonthDrafts = () => {
  const held = new Map<string, Place & { months: TypedMonths }>();
  const halfPicked = new Set<string>();
  const keyOf = ({ sectionId, entryId }: Place) => `${sectionId}:${entryId}`;

  return {
    get: (place: Place): TypedMonths | null => held.get(keyOf(place))?.months ?? null,
    /** Kept only while one is half typed. */
    set: (place: Place, months: TypedMonths) => {
      if (isHalf(months.start) || isHalf(months.end)) held.set(keyOf(place), { ...place, months });
      else held.delete(keyOf(place));
    },
    clear: (place: Place) => void held.delete(keyOf(place)),
    places: (): Place[] => [...held.values()].map(({ sectionId, entryId }) => ({ sectionId, entryId })),
    /** What the browser's own picker has half of, until released: it isn't kept. */
    holdHalfPicked: (place: Place) => {
      const key = keyOf(place);
      halfPicked.add(key);
      return () => void halfPicked.delete(key);
    },
    /** One of its months is half written. */
    isUnfinished: (place: Place) => held.has(keyOf(place)) || halfPicked.has(keyOf(place)),
    /** Drops those of entries that aren't in the CV any more. */
    prune: (sections: Pick<CurriculumSection, "id" | "hidden" | "entries">[]) =>
      held.forEach(({ sectionId, entryId }, key) => {
        const section = sections.find(({ id }) => id === sectionId);
        const entry = section?.hidden ? undefined : section?.entries.find(({ id }) => id === entryId);
        if (!entry || entry.hidden) held.delete(key);
      }),
  };
};

export type MonthDrafts = ReturnType<typeof createMonthDrafts>;

/** Null where an entry is always shown the same way. */
export const MonthDraftsContext = createContext<MonthDrafts | null>(null);
