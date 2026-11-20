import { ResumeDocument } from "@/lib/resume/exportDocument";
import { PaperSize } from "@/lib/types";
import { Source_Sans_3 } from "next/font/google";
import "./classic.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
});

const linkText = (label: string, url: string) => label || url.replace(/^(https?:\/\/|mailto:)/, "");

interface ClassicTemplateProps {
  document: ResumeDocument;
  /** Not used by the layout yet; templates receive it so they can adapt to the page. */
  paper: PaperSize;
}

/** A single-column CV: name and contact details, then each section in order. */
export const ClassicTemplate = ({ document, paper }: ClassicTemplateProps) => {
  const { header, sections } = document;
  const contact = [header.email, header.phone, header.location].filter(Boolean);

  return (
    <div className={`resume-classic ${sourceSans.className}`} data-paper={paper}>
      <header className="rc-header">
        {header.name && <h1 className="rc-name">{header.name}</h1>}
        {header.headline && <p className="rc-headline">{header.headline}</p>}
        {contact.length > 0 && <p className="rc-contact">{contact.join(" · ")}</p>}
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

      {sections.map((section) => (
        <section key={section.id} className="rc-section">
          <div className="rc-section-head">
            {section.heading && <h2 className="rc-heading">{section.heading}</h2>}
            {section.title && <h3 className="rc-title">{section.title}</h3>}
            {(section.subtitle || section.meta) && (
              <div className="rc-entry-line">
                <span className="rc-subtitle">{section.subtitle}</span>
                <span className="rc-meta">{section.meta}</span>
              </div>
            )}
            {section.summary && <p className="rc-summary">{section.summary}</p>}
          </div>
          {section.html && <div className="rc-body" dangerouslySetInnerHTML={{ __html: section.html }} />}
        </section>
      ))}
    </div>
  );
};
