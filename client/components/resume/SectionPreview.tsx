"use client";

import { ExportEntry, ResumeDocument } from "@/lib/resume/exportDocument";
import { ResumeHeader } from "@/lib/types";
import { hasHeaderContent } from "./resumeHeader";

interface SectionPreviewProps {
  document: ResumeDocument;
  emptyMessage?: string;
}

const HeaderPreview = ({ header }: { header: ResumeHeader }) => {
  const contact = [header.email, header.phone, header.location].filter(Boolean);

  return (
    <header className="space-y-1 border-b border-border pb-5">
      {header.name && <h1 className="text-2xl font-bold">{header.name}</h1>}
      {header.headline && <p className="text-muted-foreground">{header.headline}</p>}
      {contact.length > 0 && <p>{contact.join(" · ")}</p>}
      {header.links.length > 0 && (
        <p className="flex flex-wrap gap-x-3">
          {header.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="underline">
              {link.label || link.url.replace(/^(https?:\/\/|mailto:)/, "")}
            </a>
          ))}
        </p>
      )}
    </header>
  );
};

const EntryDetailsLine = ({ entry }: { entry: ExportEntry }) => {
  if (!entry.subtitle && !entry.meta) return null;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <p className="font-medium">{entry.subtitle}</p>
      <p className="text-muted-foreground">{entry.meta}</p>
    </div>
  );
};

/** An unstyled rendering of exactly what the resume exports. */
const SectionPreview = ({
  document,
  emptyMessage = "Hidden text stays in the document on the left. This preview only shows what would export.",
}: SectionPreviewProps) => {
  const showHeader = hasHeaderContent(document.header);

  if (document.sections.length === 0 && !showHeader) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-8 text-sm leading-relaxed">
      {showHeader && <HeaderPreview header={document.header} />}
      {document.sections.map((section) => (
        <section key={section.id} className="space-y-2">
          {section.heading && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.heading}
            </p>
          )}
          {section.entries.map((entry) => (
            <div key={entry.id} className="space-y-2 [&+&]:pt-3">
              {entry.title && <h2 className="text-lg font-semibold">{entry.title}</h2>}
              <EntryDetailsLine entry={entry} />
              {entry.summary && <p className="text-muted-foreground">{entry.summary}</p>}
              <div
                className="space-y-2 [&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mt-1 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: entry.html }}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};

export default SectionPreview;
