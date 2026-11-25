import { useCallback, useEffect, useRef, useState } from "react";
import type { CvView } from "./useCvView";
import { whenLeft } from "./whenLeft";

/** What was just added, or a field asked for that was missing. */
export type Added = {
  what: "section" | "entry" | "bullet" | "title" | "summary";
  sectionId: number;
  entryId: string;
  /** The entry's items when it was added. */
  known: string[];
  /** Puts back what showing it ticked, if nothing was written. */
  putBack?: () => void;
};

const placeOf = ({ what, sectionId, entryId }: Added) =>
  `[data-section-id="${sectionId}"]` + (what === "section" ? "" : ` [data-entry-id="${CSS.escape(entryId)}"]`);

/**
 * What was just added in a CV: it offers a place to write, and stays in a search,
 * until the focus leaves it or the view changes.
 */
export const useAdded = (view: CvView) => {
  const [added, setAdded] = useState<Added | null>(null);
  const latest = useRef(added);

  const end = useCallback(() => {
    const ended = latest.current;
    latest.current = null;
    setAdded(null);
    // After a bullet left empty in it is gone.
    if (ended?.putBack) setTimeout(ended.putBack);
  }, []);

  useEffect(() => {
    latest.current = added;
    if (!added) return;
    const place = placeOf(added);
    return whenLeft((element) => element.closest(place) !== null, end);
  }, [added, end]);

  useEffect(() => end, [view, end]);

  return [added, setAdded, end] as const;
};
