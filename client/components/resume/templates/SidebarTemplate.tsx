import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import "./classic.css";
import { ResumeHeaderBlock, ResumeSectionBlock, TemplateProps, templateRootProps } from "./parts";
import "./sidebar.css";

/**
 * Two columns: a tinted side column with the name, contact details and the
 * sections placed there (short lists like skills by default), and a main
 * column with the rest. Each section's column comes from ExportSection.column.
 */
export const SidebarTemplate = ({ document, paper, design = DESIGN_DEFAULTS }: TemplateProps) => {
  const side = document.sections.filter((section) => section.column === "sidebar");
  const main = document.sections.filter((section) => section.column === "main");

  return (
    <div className="resume-classic resume-sidebar" {...templateRootProps(design, paper)}>
      <aside className="rs-side">
        <ResumeHeaderBlock header={document.header} stacked />
        {side.map((section) => (
          <ResumeSectionBlock key={section.id} section={section} />
        ))}
      </aside>
      <div className="rs-main">
        {main.map((section) => (
          <ResumeSectionBlock key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
};
