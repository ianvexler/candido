import { hasVisibleText, stripHiddenHtml } from "@/components/resume/documentContent";
import { hasHeaderContent } from "@/components/resume/resumeHeader";
import { formatDateRange } from "@/components/resume/sectionDetails";
import { ResumeHeader, ResumeHeaderTextFields, SectionFields } from "@/lib/types";

/** One section as it appears in an exported resume. Every field is ready to display. */
export type ExportSection = {
  id: number;
  /** Section type, e.g. "Experience". */
  heading: string;
  title: string;
  /** "Role · Organisation", or "". */
  subtitle: string;
  /** "Mar 2022 – Present · Lisbon", or "". */
  meta: string;
  summary: string;
  /** Content HTML with hidden text, and blocks left empty by it, removed. */
  html: string;
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

type InputSection = SectionFields & { id: number; hidden?: boolean };

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

const toExportSection = (section: InputSection): ExportSection => ({
  id: section.id,
  heading: section.section_type.trim(),
  title: section.title.trim(),
  subtitle: joinParts([section.role, section.organization]),
  meta: joinParts([formatDateRange(section), section.location]),
  summary: section.description?.trim() ?? "",
  html: hasVisibleText(section.content) ? stripHiddenHtml(section.content) : "",
});

const hasContent = (section: ExportSection) =>
  Boolean(section.heading || section.title || section.subtitle || section.meta || section.summary || section.html);

export const buildResumeDocument = ({
  title,
  header,
  sections,
}: {
  title: string;
  /** Already resolved: profile with this resume's overrides. */
  header: ResumeHeader;
  sections: InputSection[];
}): ResumeDocument => ({
  title: title.trim(),
  header: cleanHeader(header),
  sections: sections.filter((section) => !section.hidden).map(toExportSection).filter(hasContent),
});

export const isEmptyDocument = (doc: ResumeDocument) =>
  doc.sections.length === 0 && !hasHeaderContent(doc.header);

/** Browsers use the page title as the suggested PDF file name. */
export const pdfFileName = (doc: ResumeDocument) =>
  doc.header.name ? `${doc.header.name} - ${doc.title}` : doc.title;
