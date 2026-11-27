import { printedHtml } from "@/components/resume/documentContent";
import { formatDateRange } from "@/components/resume/sectionDetails";
import { ResumeHeader, ResumeHeaderTextFields, SectionEntry, SectionFields, SectionPlacement } from "@/lib/types";

/** One entry as it appears in an exported resume. Every field is ready to display. */
export type ExportEntry = {
  id: string;
  title: string;
  /** "Role · Organisation", or "". */
  subtitle: string;
  /** "Mar 2022 – Present · Lisbon", or "". */
  meta: string;
  summary: string;
  /** Content HTML with hidden text, and blocks left empty by it, removed. */
  html: string;
};

/** One section as it appears in an exported resume: a heading and its entries. */
export type ExportSection = {
  id: number;
  /** Section type, e.g. "Experience". */
  heading: string;
  entries: ExportEntry[];
  /** Where it sits in a two-column template. Single-column templates ignore it. */
  column: SectionPlacement;
};

/**
 * What a resume exports: shared by the preview pane, the print page and,
 * later, server-side PDF and .docx.
 */
export type ResumeDocument = {
  title: string;
  header: ResumeHeader;
  sections: ExportSection[];
};

type InputSection = SectionFields & { id: number; hidden?: boolean; placement?: SectionPlacement | null };

/** What stays even with nothing in it, as it is being edited. What is left out never does. */
export type KeptPlace = { sectionId: number; entryId: string | null };

// Short lists that read well in a narrow column.
const SIDEBAR_TYPES = /skill|language|certif|interest|hobb|tool|award|reference|contact/i;

/** The section's column in a two-column template: its chosen placement, or a guess from its type. */
export const sectionColumn = (section: { section_type: string; placement?: SectionPlacement | null }): SectionPlacement =>
  section.placement ?? (SIDEBAR_TYPES.test(section.section_type) ? "sidebar" : "main");

const joinParts = (parts: (string | null | undefined)[]) =>
  parts.map((part) => part?.trim()).filter(Boolean).join(" · ");

const cleanHeader = (header: ResumeHeader): ResumeHeader => {
  const cleaned = { ...header };
  ResumeHeaderTextFields.forEach((field) => {
    cleaned[field] = header[field].trim();
  });
  cleaned.links = header.links
    .filter((link) => link.url.trim())
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
  return cleaned;
};

/** The organisation isn't repeated when it is also the entry's title. */
export const organizationLabel = ({ title, organization }: SectionEntry) =>
  organization?.trim().toLowerCase() === title.trim().toLowerCase() ? "" : organization;

const toExportEntry = (entry: SectionEntry): ExportEntry => ({
  id: entry.id,
  title: entry.title.trim(),
  subtitle: joinParts([entry.role, organizationLabel(entry)]),
  meta: joinParts([formatDateRange(entry), entry.location]),
  summary: entry.description_off ? "" : (entry.description?.trim() ?? ""),
  html: printedHtml(entry.content),
});

const hasEntryContent = (entry: ExportEntry) =>
  Boolean(entry.title || entry.subtitle || entry.meta || entry.summary || entry.html);

const toExportSection = (section: InputSection, keep: KeptPlace[]): ExportSection => ({
  id: section.id,
  heading: section.section_type.trim(),
  entries: section.entries
    .filter((entry) => !entry.hidden)
    .map(toExportEntry)
    .filter((entry) => hasEntryContent(entry) || keep.some((kept) => kept.sectionId === section.id && kept.entryId === entry.id)),
  column: sectionColumn(section),
});

/** Hidden itself, or every entry is. */
export const isLeftOut = (section: Pick<InputSection, "hidden" | "entries">) =>
  section.hidden || (section.entries.length > 0 && section.entries.every((entry) => entry.hidden));

const hasContent = (section: ExportSection) => Boolean(section.heading || section.entries.length > 0);

export const buildResumeDocument = ({
  title,
  header,
  sections,
  keep = [],
}: {
  title: string;
  /** Already resolved: profile with this resume's overrides. */
  header: ResumeHeader;
  sections: InputSection[];
  keep?: KeptPlace[];
}): ResumeDocument => ({
  title: title.trim(),
  header: cleanHeader(header),
  sections: sections
    .filter((section) => !isLeftOut(section))
    .map((section) => toExportSection(section, keep))
    .filter((section) => hasContent(section) || keep.some((kept) => kept.sectionId === section.id)),
});

/** Nothing worth printing: a header alone isn't a resume. */
export const isEmptyDocument = (doc: ResumeDocument) => doc.sections.length === 0;

/** Browsers use the page title as the suggested PDF file name. */
export const pdfFileName = (doc: ResumeDocument) =>
  doc.header.name ? `${doc.header.name} - ${doc.title}` : doc.title;
