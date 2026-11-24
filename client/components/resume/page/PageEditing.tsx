"use client";

import { ExportEntry, ExportSection } from "@/lib/resume/exportDocument";
import { createContext, ReactNode } from "react";

/** A piece of one-line text on the page. */
export type TextSlot =
  | { kind: "name" | "headline" }
  | { kind: "heading"; sectionId: number }
  | { kind: "title" | "summary"; sectionId: number; entryId: string };

export type TextBinding = {
  /** As stored; shown spaced as it prints. Must be empty for text the CV leaves out. */
  value: string;
  label: string;
  /** Gets the text as typed. Trimming it is for whoever saves it. */
  onChange: (value: string) => void;
  /** Keeps an empty field on the page. Otherwise it has no element, as in print. */
  open?: boolean;
  placeholder?: string;
  /** Never reported blank: left blank, it goes back to what it was when entered. */
  required?: boolean;
  /** Enter moves on; without this it only leaves the field. */
  onEnter?: () => void;
};

/**
 * What makes a template editable. Sections only follow a change of the context or
 * of their own ExportSection. Each returns null for what stays as printed;
 * replacements must lay out as what they replace (see EntryLine and ContactLines).
 */
export type PageEditing = {
  text: (slot: TextSlot, of: ExportSection | ExportEntry | null) => TextBinding | null;
  /** Replaces the role, dates and place line. */
  line: (entry: ExportEntry) => ReactNode | null;
  /** Replaces what is inside the entry's .rc-body. */
  body: (entry: ExportEntry) => ReactNode | null;
  /** Replaces the contact details and links. */
  contact: () => ReactNode | null;
};

/** Null wherever a CV is only shown or printed. */
export const PageEditingContext = createContext<PageEditing | null>(null);
