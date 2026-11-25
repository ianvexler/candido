import type { CurriculumSection } from "@/lib/types";
import { RefObject, useCallback, useMemo, useRef, useState } from "react";
import { cardAnchor, cardKey, CardPlace, Cards, entryAt } from "./cardPlace";
import type { CardFocus } from "./PageCard";

type OpenCard = { place: CardPlace; key: string; focus: CardFocus };
type EntryPlace = Extract<CardPlace, { kind: "entry" }>;

/** Which cards a page has open, or keeps for what is unfinished in them. */
export const usePageCards = (rootRef: RefObject<HTMLElement | null>, sections: CurriculumSection[]) => {
  const [asked, setAsked] = useState<OpenCard | null>(null);
  const [unfinished, setUnfinished] = useState<EntryPlace[]>([]);
  const gateRef = useRef<(() => boolean) | null>(null);

  const exists = (place: CardPlace) => place.kind === "contact" || entryAt(sections, place.sectionId, place.entryId) !== null;
  // Its entry was left out or deleted. It doesn't open again by itself if that comes back.
  if (asked && !exists(asked.place)) setAsked(null);
  if (!unfinished.every(exists)) setUnfinished(unfinished.filter(exists));
  const open = asked && exists(asked.place) ? asked : null;
  const openKey = open?.key ?? null;

  const openCard = useCallback(
    (place: CardPlace, field: string) => {
      const key = cardKey(place);
      if (key !== openKey && gateRef.current && !gateRef.current()) return;
      setAsked({ place, key, focus: { field } });
    },
    [openKey]
  );

  const close = (key: string, byKey: boolean) => {
    if (byKey && open) focusPlace(rootRef.current, open.place);
    setAsked((now) => (now?.key === key ? null : now));
  };

  const reportUnfinished = useCallback((place: EntryPlace, is: boolean) => {
    const key = cardKey(place);
    setUnfinished((now) => {
      const has = now.some((each) => cardKey(each) === key);
      if (has === is) return now;
      return is ? [...now, place] : now.filter((each) => cardKey(each) !== key);
    });
  }, []);

  const context = useMemo<Cards>(() => ({ openKey, openCard }), [openKey, openCard]);

  return { open, unfinished, context, openCard, close, gateRef, reportUnfinished };
};

/** Where a card's focus goes back to. */
const focusPlace = (root: HTMLElement | null, place: CardPlace) => {
  const anchor = cardAnchor(root, place);
  const target = anchor?.matches("[tabindex], button")
    ? anchor
    : ([".rc-title[contenteditable]", '[contenteditable], [role="textbox"]']
        .map((selector) => anchor?.querySelector<HTMLElement>(selector))
        .find(Boolean) ?? null);
  (target ?? root)?.focus({ preventScroll: true });
};
