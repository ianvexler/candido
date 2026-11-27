"use client";

import { hasHeaderContent } from "../resumeHeader";
import type { ResumeHeader } from "@/lib/types";
import { MouseEvent, useContext } from "react";
import { ContactLines } from "../templates/parts";
import { cardKey, CardsContext, offsetAt, partAt } from "./cardPlace";
import { opensCard } from "./opensCard";

const FIELDS = ["email", "phone", "location"] as const;
const PLACE = { kind: "contact" as const };

export const hasContact = (header: ResumeHeader) => hasHeaderContent({ ...header, name: "", headline: "" });

const shownFields = (header: ResumeHeader) => FIELDS.filter((field) => header[field]);

/** Which field the pressed part shows. */
const fieldAt = ({ target, clientX, clientY }: MouseEvent<HTMLElement>, header: ResumeHeader): string | null => {
  if (!(target instanceof Element)) return null;
  if (target.closest(".rc-links")) return "links";
  const line = target.closest(".rc-contact");
  if (!line) return null;
  const shown = shownFields(header);
  const item = target.closest("li");
  if (item) return shown[[...line.children].indexOf(item)] ?? null;
  return partAt(
    shown.map((field) => ({ text: header[field], field })),
    offsetAt(line, clientX, clientY) ?? 0
  );
};

/** The contact details and links as printed, opening a card with their fields. */
const PageContact = ({ header, stacked }: { header: ResumeHeader; stacked: boolean }) => {
  const cards = useContext(CardsContext)!;
  if (!hasContact(header)) return null;

  return (
    <div
      className="page-contact"
      aria-label={`Edit contact details and links: ${[
        ...shownFields(header).map((field) => header[field]),
        ...header.links.map(({ label, url }) => label || url),
      ].join(", ")}`}
      {...opensCard({
        open: cards.openKey === cardKey(PLACE),
        onOpen: (event) => cards.openCard(PLACE, (event && fieldAt(event, header)) ?? shownFields(header)[0] ?? "links"),
      })}
    >
      <ContactLines header={header} stacked={stacked} inert />
    </div>
  );
};

export default PageContact;
