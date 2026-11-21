import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import { ClassicTemplate } from "./ClassicTemplate";
import { TemplateProps } from "./parts";
import { SidebarTemplate } from "./SidebarTemplate";

/** Renders the resume in the template its design picks. */
export const ResumeTemplate = (props: TemplateProps) =>
  (props.design ?? DESIGN_DEFAULTS).template === "sidebar" ? <SidebarTemplate {...props} /> : <ClassicTemplate {...props} />;
