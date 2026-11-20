"use client";

import { ResumeHeader, SectionFields } from "@/lib/types";
import { hasVisibleText, stripHiddenHtml } from "./documentContent";
import { hasHeaderContent } from "./resumeHeader";

type PreviewSection = SectionFields & { id: number };

interface SectionPreviewProps {
  header?: ResumeHeader;
  sections: PreviewSection[];
  emptyMessage?: string;
}

const HeaderPreview = ({ header }: { header: ResumeHeader }) => {
  const contact = [header.email, header.phone, header.location].map((value) => value.trim()).filter(Boolean);
  const links = header.links.filter((link) => link.url.trim());

  return (
    <header className="space-y-1 border-b border-border pb-5">
      {header.name.trim() && <h1 className="text-2xl font-bold">{header.name}</h1>}
      {header.headline.trim() && <p className="text-muted-foreground">{header.headline}</p>}
      {contact.length > 0 && <p>{contact.join(" · ")}</p>}
      {links.length > 0 && (
        <p className="flex flex-wrap gap-x-3">
          {links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="underline">
              {link.label.trim() || link.url.replace(/^(https?:\/\/|mailto:)/, "")}
            </a>
          ))}
        </p>
      )}
    </header>
  );
};

const SectionPreview = ({
  header,
  sections,
  emptyMessage = "Hidden text stays in the document on the left. This preview only shows what would export.",
}: SectionPreviewProps) => {
  const visible = sections.filter(
    (section) =>
      section.title.trim() ||
      section.section_type.trim() ||
      section.description?.trim() ||
      hasVisibleText(section.content)
  );

  const showHeader = header !== undefined && hasHeaderContent(header);

  if (visible.length === 0 && !showHeader) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-8 text-sm leading-relaxed">
      {showHeader && <HeaderPreview header={header} />}
      {visible.map((section) => (
        <section key={section.id} className="space-y-2">
          {section.section_type.trim() && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {section.section_type}
            </p>
          )}
          {section.title.trim() && <h2 className="text-lg font-semibold">{section.title}</h2>}
          {section.description?.trim() && (
            <p className="text-muted-foreground">{section.description}</p>
          )}
          <div
            className="space-y-2 [&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mt-1 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: stripHiddenHtml(section.content) }}
          />
        </section>
      ))}
    </div>
  );
};

export default SectionPreview;
