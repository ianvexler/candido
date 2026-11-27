"use client";

import type { HeaderDraft } from "@/lib/resume/useHeaderDraft";
import { ReactNode, useMemo } from "react";
import { HeaderFields } from "../HeaderFields";
import type { TextBinding } from "./PageEditing";

/** Makes the header editable. */
export type HeaderBinding = {
  text: (kind: "name" | "headline") => TextBinding | null;
  /** What the contact card holds. */
  contact: () => ReactNode;
};

const LABELS = { name: "Name", headline: "Headline" };

/** A header's draft, for the page. The same object until that changes. */
export const useHeaderBinding = (header: HeaderDraft): HeaderBinding =>
  useMemo(
    () => ({
      text: (kind) => {
        const profile = header.fallback?.[kind] ?? "";
        return {
          value: header.isOverridden(kind) || !header.fallback ? (header.draft[kind] ?? "") : profile,
          label: LABELS[kind],
          placeholder: profile || undefined,
          fallback: profile,
          // As the profile has it, it needs no override.
          onChange: (text) => header.setText(kind, header.fallback && text.trim() === profile.trim() ? "" : text),
        };
      },
      contact: () => <HeaderFields header={header} inCard />,
    }),
    [header]
  );
