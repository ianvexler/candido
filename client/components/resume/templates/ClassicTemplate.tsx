import { DESIGN_DEFAULTS, DesignFont, DesignSettings, designStyle } from "@/lib/resume/design";
import { ResumeDocument } from "@/lib/resume/exportDocument";
import { PaperSize } from "@/lib/types";
import { IBM_Plex_Sans, Lora, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./classic.css";

// next/font needs literal options in each call at module level. Only the
// default font is preloaded; the others download when a resume or the Design
// panel first uses them, and printing waits for document.fonts.ready.
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });
const lora = Lora({ subsets: ["latin", "latin-ext"], weight: ["400", "600", "700"], preload: false });

export const FONT_FAMILIES: Record<DesignFont, string> = {
  source_sans: sourceSans.style.fontFamily,
  plex_sans: plexSans.style.fontFamily,
  source_serif: sourceSerif.style.fontFamily,
  lora: lora.style.fontFamily,
};

const linkText = (label: string, url: string) => label || url.replace(/^(https?:\/\/|mailto:)/, "");

interface ClassicTemplateProps {
  document: ResumeDocument;
  /** Not used by the layout yet; templates receive it so they can adapt to the page. */
  paper: PaperSize;
  design?: DesignSettings;
}

/** A single-column CV: name and contact details, then each section in order. */
export const ClassicTemplate = ({ document, paper, design = DESIGN_DEFAULTS }: ClassicTemplateProps) => {
  const { header, sections } = document;
  const contact = [header.email, header.phone, header.location].filter(Boolean);

  return (
    <div
      className="resume-classic"
      data-paper={paper}
      data-heading-style={design.heading_style}
      data-date-position={design.date_position}
      style={designStyle(design, FONT_FAMILIES)}
    >
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
