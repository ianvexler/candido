import { PageEditing, PageEditingContext, TextSlot } from "@/components/resume/page/PageEditing";
import { PageText } from "@/components/resume/page/PageText";
import { DesignSettings, designStyle } from "@/lib/resume/design";
import { ExportEntry, ExportSection, ResumeDocument } from "@/lib/resume/exportDocument";
import { PaperSize, ResumeHeader } from "@/lib/types";
import { memo, useContext } from "react";
import { FONT_FAMILIES } from "./fonts";

/** What every template receives. */
export interface TemplateProps {
  document: ResumeDocument;
  /** Not used by the layouts yet; templates receive it so they can adapt to the page. */
  paper: PaperSize;
  design?: DesignSettings;
}

const linkText = (label: string, url: string) => label || url.replace(/^(https?:\/\/|mailto:)/, "");

/**
 * The root's design attributes and custom properties, which classic.css reads.
 * Every template's root also carries the resume-classic class, so headings,
 * sizes and spacing look the same whichever layout arranges them.
 */
export const templateRootProps = (design: DesignSettings, paper: PaperSize) => ({
  "data-paper": paper,
  "data-heading-case": design.heading_case,
  "data-heading-rule": design.heading_rule,
  "data-date-position": design.date_position,
  style: designStyle(design, FONT_FAMILIES),
});

/** The text as printed, or the same element editable. */
const slotText = (
  editing: PageEditing | null,
  slot: TextSlot,
  of: ExportSection | ExportEntry | null,
  { as: As, className, text, block }: { as: "h1" | "h2" | "h3" | "p"; className: string; text: string; block?: string }
) => {
  const binding = editing?.text(slot, of);
  if (binding) return <PageText as={As} className={className} binding={binding} block={block} />;
  return (
    text && (
      <As className={className} data-block={editing ? block : undefined}>
        {text}
      </As>
    )
  );
};

/** The contact details and links. */
export const ContactLines = ({ header, stacked = false }: { header: ResumeHeader; stacked?: boolean }) => {
  const contact = [header.email, header.phone, header.location].filter(Boolean);
  return (
    <>
      {contact.length > 0 &&
        (stacked ? (
          <ul className="rc-contact">
            {contact.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="rc-contact">{contact.join(" · ")}</p>
        ))}
      {header.links.length > 0 && (
        <p className="rc-links">
          {header.links.map((link) => (
            <a key={link.url} href={link.url}>
              {linkText(link.label, link.url)}
            </a>
          ))}
        </p>
      )}
    </>
  );
};

/** Name, headline, contact details and links. `stacked` puts each detail on its own line. */
export const ResumeHeaderBlock = ({ header, stacked = false }: { header: ResumeHeader; stacked?: boolean }) => {
  const editing = useContext(PageEditingContext);
  return (
    <header className="rc-header" data-stacked={stacked || undefined} data-block={editing ? "header" : undefined}>
      {slotText(editing, { kind: "name" }, null, { as: "h1", className: "rc-name", text: header.name })}
      {slotText(editing, { kind: "headline" }, null, { as: "p", className: "rc-headline", text: header.headline })}
      {editing?.contact() ?? <ContactLines header={header} stacked={stacked} />}
    </header>
  );
};

/** An entry's role and organisation, then its dates and place. */
export const EntryLine = ({ entry }: { entry: ExportEntry }) =>
  (entry.subtitle || entry.meta) && (
    <div className="rc-entry-line">
      <span className="rc-subtitle">{entry.subtitle}</span>
      <span className="rc-meta">{entry.meta}</span>
    </div>
  );

const EntryBody = ({ entry }: { entry: ExportEntry }) => {
  const body = useContext(PageEditingContext)?.body(entry) ?? null;
  if (body !== null) return <div className="rc-body">{body}</div>;
  return entry.html && <div className="rc-body" dangerouslySetInnerHTML={{ __html: entry.html }} />;
};

/** One section: its heading, then each entry's title, role and dates, summary and content. */
export const ResumeSectionBlock = memo(({ section }: { section: ExportSection }) => {
  const editing = useContext(PageEditingContext);
  const sectionId = section.id;
  // The heading sits in the first entry's head, so print keeps the two together.
  const heading = slotText(
    editing,
    { kind: "heading", sectionId },
    section,
    { as: "h2", className: "rc-heading", text: section.heading, block: section.entries.length === 0 ? "heading" : undefined }
  );

  return (
    <section className="rc-section" data-section-id={editing ? sectionId : undefined}>
      {section.entries.length === 0 && heading}
      {section.entries.map((entry, index) => {
        const entryId = entry.id;
        return (
          <div key={entryId} className="rc-entry" data-entry-id={editing ? entryId : undefined}>
            <div className="rc-section-head" data-block={editing ? "head" : undefined}>
              {index === 0 && heading}
              {slotText(editing, { kind: "title", sectionId, entryId }, entry, { as: "h3", className: "rc-title", text: entry.title })}
              {editing?.line(entry) ?? <EntryLine entry={entry} />}
              {slotText(editing, { kind: "summary", sectionId, entryId }, entry, { as: "p", className: "rc-summary", text: entry.summary })}
            </div>
            <EntryBody entry={entry} />
          </div>
        );
      })}
    </section>
  );
});
ResumeSectionBlock.displayName = "ResumeSectionBlock";
