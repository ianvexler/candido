import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import "./classic.css";
import { ResumeHeaderBlock, ResumeSectionBlock, TemplateProps, templateRootProps } from "./parts";

/** A single-column CV: name and contact details, then each section in order. */
export const ClassicTemplate = ({ document, paper, design = DESIGN_DEFAULTS }: TemplateProps) => (
  <div className="resume-classic" {...templateRootProps(design, paper)}>
    <ResumeHeaderBlock header={document.header} />
    {document.sections.map((section) => (
      <ResumeSectionBlock key={section.id} section={section} />
    ))}
  </div>
);
