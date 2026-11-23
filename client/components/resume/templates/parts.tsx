import { DesignSettings, designStyle } from "@/lib/resume/design";
import { ExportSection, ResumeDocument } from "@/lib/resume/exportDocument";
import { PaperSize, ResumeHeader } from "@/lib/types";
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

/** Name, headline, contact details and links. `stacked` puts each detail on its own line. */
export const ResumeHeaderBlock = ({ header, stacked = false }: { header: ResumeHeader; stacked?: boolean }) => {
  const contact = [header.email, header.phone, header.location].filter(Boolean);
  return (
    <header className="rc-header" data-stacked={stacked || undefined}>
      {header.name && <h1 className="rc-name">{header.name}</h1>}
      {header.headline && <p className="rc-headline">{header.headline}</p>}
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
    </header>
  );
};

/** One section: its heading, then each entry's title, role and dates, summary and content. */
export const ResumeSectionBlock = ({ section }: { section: ExportSection }) => {
  // The heading sits in the first entry's head, so print keeps the two together.
  const heading = section.heading && <h2 className="rc-heading">{section.heading}</h2>;

  return (
    <section className="rc-section">
      {section.entries.length === 0 && heading}
      {section.entries.map((entry, index) => (
        <div key={entry.id} className="rc-entry">
          <div className="rc-section-head">
            {index === 0 && heading}
            {entry.title && <h3 className="rc-title">{entry.title}</h3>}
            {(entry.subtitle || entry.meta) && (
              <div className="rc-entry-line">
                <span className="rc-subtitle">{entry.subtitle}</span>
                <span className="rc-meta">{entry.meta}</span>
              </div>
            )}
            {entry.summary && <p className="rc-summary">{entry.summary}</p>}
          </div>
          {entry.html && <div className="rc-body" dangerouslySetInnerHTML={{ __html: entry.html }} />}
        </div>
      ))}
    </section>
  );
};
