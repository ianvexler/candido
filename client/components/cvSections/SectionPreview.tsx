"use client";

import { SectionTemplate } from "@/lib/types";
import { hasVisibleText, stripHiddenHtml } from "./documentContent";

interface SectionPreviewProps {
  templates: SectionTemplate[];
}

const SectionPreview = ({ templates }: SectionPreviewProps) => {
  const visible = templates.filter(
    (template) =>
      template.title.trim() ||
      template.section_type.trim() ||
      template.description?.trim() ||
      hasVisibleText(template.content)
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Hidden text stays in the document on the left. This preview only shows what would export.
      </p>
    );
  }

  return (
    <div className="space-y-8 text-sm leading-relaxed">
      {visible.map((template) => (
        <section key={template.id} className="space-y-2">
          {template.section_type.trim() && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.section_type}
            </p>
          )}
          {template.title.trim() && <h2 className="text-lg font-semibold">{template.title}</h2>}
          {template.description?.trim() && (
            <p className="text-muted-foreground">{template.description}</p>
          )}
          <div
            className="space-y-2 [&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:mt-1 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: stripHiddenHtml(template.content) }}
          />
        </section>
      ))}
    </div>
  );
};

export default SectionPreview;
