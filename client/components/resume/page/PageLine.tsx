"use client";

import type { ExportEntry } from "@/lib/resume/exportDocument";
import type { SectionEntry } from "@/lib/types";
import { MouseEvent, useContext } from "react";
import type { DetailField } from "../EntryDetails";
import { formatDateRange } from "../sectionDetails";
import { EntryLine } from "../templates/parts";
import { cardKey, CardsContext, offsetAt, partAt } from "./cardPlace";
import { opensCard } from "./opensCard";

/** Which field the pressed part of a line shows. */
const fieldAt = ({ currentTarget, target, clientX, clientY }: MouseEvent<HTMLElement>, entry: SectionEntry): DetailField | null => {
  const piece = [...currentTarget.children].find((each) => each.contains(target as Node));
  if (!piece?.textContent) return null;
  const offset = offsetAt(piece, clientX, clientY) ?? 0;
  if (piece.classList.contains("rc-subtitle")) {
    return partAt<DetailField>(
      [
        { text: entry.role?.trim() ?? "", field: "role" },
        { text: entry.organization?.trim() ?? "", field: "organization" },
      ],
      offset
    );
  }
  return partAt<DetailField>(
    [
      { text: formatDateRange(entry), field: "dates" },
      { text: entry.location?.trim() ?? "", field: "location" },
    ],
    offset
  );
};

interface PageLineProps {
  entry: ExportEntry;
  sectionId: number;
  /** What it was made from. */
  source: SectionEntry;
}

/** An entry's role, dates and place as printed, opening a card with their fields. */
const PageLine = ({ entry, sectionId, source }: PageLineProps) => {
  const cards = useContext(CardsContext)!;
  const place = { kind: "entry" as const, sectionId, entryId: entry.id };
  const first: DetailField = source.role?.trim() ? "role" : entry.subtitle ? "organization" : formatDateRange(source) ? "dates" : "location";

  return (
    <EntryLine
      entry={entry}
      className="page-line"
      aria-label={`Edit role, dates and place: ${[entry.subtitle, entry.meta].filter(Boolean).join(", ")}`}
      {...opensCard({
        open: cards.openKey === cardKey(place),
        onOpen: (event) => cards.openCard(place, (event && fieldAt(event, source)) ?? first),
      })}
    />
  );
};

export default PageLine;
