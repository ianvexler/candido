"use client";

import { DESIGN_DEFAULTS } from "@/lib/resume/design";
import { sidebarPages } from "@/lib/resume/sidebarPages";
import { CSSProperties, useLayoutEffect, useRef, useState } from "react";
import "./classic.css";
import { ResumeHeaderBlock, ResumeSectionBlock, TemplateProps, templateRootProps } from "./parts";
import "./sidebar.css";

/**
 * A tinted side column against the page edge, with the name, contact details
 * and the sections placed there (short lists like skills by default), and the
 * rest beside it. Main sections below the side column, such as on page 2, use
 * the full width. Each section's column comes from ExportSection.column.
 *
 * The side column is a whole number of pages tall, so its tint runs to the
 * bottom of every page it's on. It measures its own content to know how many.
 */
export const SidebarTemplate = ({ document, paper, design = DESIGN_DEFAULTS }: TemplateProps) => {
  const side = document.sections.filter((section) => section.column === "sidebar");
  const main = document.sections.filter((section) => section.column === "main");
  const content = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(1);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () =>
      setPages(sidebarPages({ contentPx: element.getBoundingClientRect().height, paper, marginYmm: design.margin_y }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [paper, design.margin_y]);

  const root = templateRootProps(design, paper);

  return (
    <div
      className="resume-classic resume-sidebar"
      {...root}
      style={{ ...root.style, "--rs-pages": pages } as CSSProperties}
    >
      <aside className="rs-side">
        <div ref={content} className="rs-side-content">
          <ResumeHeaderBlock header={document.header} stacked />
          {side.map((section) => (
            <ResumeSectionBlock key={section.id} section={section} />
          ))}
        </div>
      </aside>
      <div className="rs-main">
        {main.map((section) => (
          <ResumeSectionBlock key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
};
