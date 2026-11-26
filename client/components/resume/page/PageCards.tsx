"use client";

import type { ExportSection } from "@/lib/resume/exportDocument";
import type { EntryVersions } from "@/lib/resume/sectionDrafts";
import type { CurriculumSection, SectionEntry } from "@/lib/types";
import { PlusIcon, TriangleAlertIcon } from "lucide-react";
import { ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { EntryDetailsFields, useEntryMonths } from "../EntryDetails";
import IconAction from "../IconAction";
import { changeEntry, OnSectionChange } from "./BodySlot";
import { cardAnchor, cardKey, CardPlace, datesProblem, entryAt } from "./cardPlace";
import { HiddenMarkAt, MARK_SIZE } from "./HiddenTextMarks";
import PageCard, { CardFocus } from "./PageCard";
import { sourceOfEntry } from "./pageDocument";
import type { usePageCards } from "./usePageCards";

type EntryPlace = Extract<CardPlace, { kind: "entry" }>;
type PageCardsState = ReturnType<typeof usePageCards>;

const NO_FOCUS: CardFocus = { field: "" };

interface EntryCardProps {
  place: EntryPlace;
  entry: SectionEntry;
  version: number;
  focus: CardFocus | null;
  rootRef: RefObject<HTMLElement | null>;
  gateRef: PageCardsState["gateRef"];
  onSectionChange: OnSectionChange;
  onClose: (key: string, byKey: boolean) => void;
  onUnfinished: (place: EntryPlace, is: boolean) => void;
}

const EntryCard = ({ place, entry, version, focus, rootRef, gateRef, onSectionChange, onClose, onUnfinished }: EntryCardProps) => {
  const months = useEntryMonths(entry, place.sectionId);
  const { unfinished, halfTyped, endBeforeStart } = months;
  // Each shows the warning anew, so that it is read out again.
  const [warnings, setWarnings] = useState(0);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const { sectionId, entryId } = place;
  const key = cardKey(place);
  if (!focus && warnings > 0) setWarnings(0);
  // As its fields are now: one tells that it is half picked only when it is left.
  const isUnfinished = () =>
    halfTyped ||
    [...(fieldsRef.current?.querySelectorAll("input") ?? [])].some(({ validity }) => validity.badInput);
  const leaveField = () => {
    if (fieldsRef.current?.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };

  useEffect(() => {
    onUnfinished({ kind: "entry", sectionId, entryId }, unfinished);
  }, [onUnfinished, sectionId, entryId, unfinished]);

  return (
    <PageCard
      anchor={() => cardAnchor(rootRef.current, place)}
      label="Role, dates and place"
      hidden={!focus}
      focus={focus ?? NO_FOCUS}
      gateRef={gateRef}
      isBlocked={() => isUnfinished() || endBeforeStart}
      onBlocked={() => {
        leaveField();
        setWarnings((count) => count + 1);
      }}
      onClose={(byKey) => {
        // So that it is kept.
        if (isUnfinished()) onUnfinished(place, true);
        leaveField();
        onClose(key, byKey);
      }}
    >
      <div ref={fieldsRef} className="space-y-2 [&>div]:gap-y-2">
        <EntryDetailsFields
          entry={entry}
          onChange={(changes) => changeEntry(onSectionChange, sectionId, entryId, changes, version)}
          months={months}
          warn={warnings > 0}
          warnings={warnings}
        />
      </div>
    </PageCard>
  );
};

interface PageCardsProps {
  cards: PageCardsState;
  rootRef: RefObject<HTMLElement | null>;
  sections: CurriculumSection[];
  versions: Record<number, EntryVersions>;
  onSectionChange: OnSectionChange;
  contact: (() => ReactNode) | null;
}

/** The card that is open, and those kept for what is unfinished in them. */
export const PageCards = ({ cards, rootRef, sections, versions, onSectionChange, contact }: PageCardsProps) => {
  const { open, unfinished, close, gateRef, reportUnfinished } = cards;
  const places = unfinished.filter((place) => cardKey(place) !== open?.key);
  if (open?.place.kind === "entry") places.push(open.place);

  return (
    <>
      {places.map((place) => {
        const entry = entryAt(sections, place.sectionId, place.entryId);
        const key = cardKey(place);
        return (
          entry && (
            <EntryCard
              key={key}
              place={place}
              entry={entry}
              version={versions[place.sectionId]?.[place.entryId] ?? 0}
              focus={open?.key === key ? open.focus : null}
              rootRef={rootRef}
              gateRef={gateRef}
              onSectionChange={onSectionChange}
              onClose={close}
              onUnfinished={reportUnfinished}
            />
          )
        );
      })}
      {open?.place.kind === "contact" && contact && (
        <PageCard
          anchor={() => cardAnchor(rootRef.current, open.place)}
          label="Name, contact details and links"
          focus={open.focus}
          gateRef={gateRef}
          onClose={(byKey) => close(open.key, byKey)}
        >
          <div className="space-y-3">{contact()}</div>
        </PageCard>
      )}
    </>
  );
};

/** Beside an entry whose dates need attention. */
export type DatesMarkAt = { top: number; side: "left" | "right"; place: EntryPlace; problem: string };

/** Where they are, clear of the other marks. */
export const findDatesMarks = (
  root: HTMLElement,
  scale: number,
  sections: ExportSection[],
  unfinished: EntryPlace[],
  others: Pick<HiddenMarkAt, "top" | "side">[]
): DatesMarkAt[] => {
  const keys = new Set(unfinished.map(cardKey));
  const base = root.getBoundingClientRect().top;
  const taken: { top: number; side: string }[] = [...others];
  return sections.flatMap((section) =>
    section.entries.flatMap((shown): DatesMarkAt[] => {
      const entry = sourceOfEntry(shown)?.entry;
      const place: EntryPlace = { kind: "entry", sectionId: section.id, entryId: shown.id };
      const problem = entry && datesProblem(entry, keys.has(cardKey(place)));
      const anchor = problem ? cardAnchor(root, place) : null;
      if (!problem || !anchor) return [];
      const side = anchor.closest(".rs-main") ? "right" : "left";
      let top = (anchor.getBoundingClientRect().top - base) / scale + MARK_SIZE / 2;
      taken
        .filter((other) => other.side === side)
        .sort((a, b) => a.top - b.top)
        .forEach((other) => {
          if (Math.abs(other.top - top) < MARK_SIZE) top = other.top + MARK_SIZE;
        });
      taken.push({ top, side });
      return [{ top, side, place, problem }];
    })
  );
};

const markStyle = (top: number, side: "left" | "right", inside: boolean) => ({
  top: top - MARK_SIZE / 2,
  [side]: inside ? 2 : -MARK_SIZE - 6,
});

interface CardMarksProps {
  marks: DatesMarkAt[];
  inside: boolean;
  openKey: string | null;
  openCard: PageCardsState["openCard"];
  /** Nothing is on the page to open the contact card from. */
  addContact: { top: number; named: boolean } | null;
}

/** Beside the sheets: what opens a card where the page has nothing to press. */
export const CardMarks = ({ marks, inside, openKey, openCard, addContact }: CardMarksProps) => (
  <>
    {addContact !== null && (
      <IconAction
        label={addContact.named ? "Add contact details" : "Add name and contact details"}
        data-add-contact
        side="left"
        aria-haspopup="dialog"
        aria-expanded={openKey === "contact"}
        onClick={() => openCard({ kind: "contact" }, addContact.named ? "email" : "name")}
        className="absolute size-6 text-muted-foreground/70 print:hidden [&_svg]:size-3.5"
        style={markStyle(addContact.top, "left", inside)}
      >
        <PlusIcon />
      </IconAction>
    )}
    {marks
      .filter(({ place }) => cardKey(place) !== openKey)
      .map(({ top, side, place, problem }) => (
        <IconAction
          key={cardKey(place)}
          label={problem}
          side={side}
          aria-haspopup="dialog"
          onClick={() => openCard(place, "dates")}
          className="absolute size-6 text-destructive hover:text-destructive print:hidden [&_svg]:size-3.5"
          style={markStyle(top, side, inside)}
        >
          <TriangleAlertIcon />
        </IconAction>
      ))}
  </>
);
