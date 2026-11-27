import { useCallback, useEffect, useRef, useState } from "react";
import type { CvView } from "./useCvView";
import { whenLeft } from "./whenLeft";

/** What was just added, or a field asked for that was missing. */
export type Added = {
  what: "section" | "entry" | "bullet" | "title" | "summary" | "details";
  sectionId: number;
  entryId: string;
  /** The entry's items when it was added. */
  known: string[];
  /** Puts back what showing it ticked, if nothing was written. */
  putBack?: () => void;
};

const isInPlace = ({ what, sectionId, entryId }: Added) => {
  const place =
    `[data-section-id="${sectionId}"]` + (what === "section" ? "" : ` [data-entry-id="${CSS.escape(entryId)}"]`);
  return (element: Element) => element.closest(what === "details" ? `${place}, [role=dialog]` : place) !== null;
};

/**
 * What was just added in a CV: it offers a place to write, and stays in a search,
 * until the focus leaves it or the view changes.
 */
export const useAdded = (view: CvView) => {
  const [added, setAdded] = useState<Added | null>(null);
  const latest = useRef<Added | null>(null);
  // Left, and not put back yet.
  const leaving = useRef<{ added: Added; timer: ReturnType<typeof setTimeout> } | null>(null);

  const putBackLeft = useCallback(() => {
    if (!leaving.current) return;
    const left = leaving.current;
    leaving.current = null;
    clearTimeout(left.timer);
    left.added.putBack?.();
  }, []);

  const end = useCallback(() => {
    putBackLeft();
    const ended = latest.current;
    latest.current = null;
    setAdded(null);
    // After a bullet left empty in it is gone.
    if (ended?.putBack) leaving.current = { added: ended, timer: setTimeout(putBackLeft) };
  }, [putBackLeft]);

  /** Gives what was added last, if it isn't put back yet, to the caller: to put back, or to go on with. */
  const take = useCallback((): Added | null => {
    const now = latest.current;
    latest.current = null;
    if (now) {
      putBackLeft();
      return now;
    }
    const left = leaving.current;
    leaving.current = null;
    clearTimeout(left?.timer);
    return left?.added ?? null;
  }, [putBackLeft]);

  /** After taking what came before. */
  const start = useCallback((next: Added | null) => {
    latest.current = next;
    setAdded(next);
  }, []);

  useEffect(() => (added ? whenLeft(isInPlace(added), end) : undefined), [added, end]);

  useEffect(() => end, [view, end]);

  return { added, start, take };
};
