"use client";

import { SectionTemplate, SectionTemplateItem } from "@/lib/types";
import { ReactNode } from "react";
import { visibleItemHtml } from "./documentContent";

interface SectionPreviewProps {
  templates: SectionTemplate[];
}

const renderItems = (items: SectionTemplateItem[]) => {
  const nodes: ReactNode[] = [];
  let listItems: { id: number; html: string }[] = [];
  let listKind: "bullet" | "ordered" | null = null;

  const flushList = () => {
    if (listItems.length === 0 || !listKind) return;
    const Tag = listKind === "ordered" ? "ol" : "ul";
    const listClass =
      listKind === "ordered"
        ? "list-decimal pl-5 space-y-1"
        : "list-disc pl-5 space-y-1";
    nodes.push(
      <Tag key={`list-${listItems[0].id}`} className={listClass}>
        {listItems.map((item) => (
          <li key={item.id} dangerouslySetInnerHTML={{ __html: item.html }} />
        ))}
      </Tag>
    );
    listItems = [];
    listKind = null;
  };

  items.forEach((item) => {
    const html = visibleItemHtml(item).trim();
    if (!html) return;

    if (item.kind === "bullet" || item.kind === "ordered") {
      if (listKind && listKind !== item.kind) flushList();
      listKind = item.kind;
      listItems.push({ id: item.id, html });
      return;
    }

    flushList();
    if (item.kind === "heading") {
      nodes.push(
        <h3 key={item.id} className="font-semibold text-base" dangerouslySetInnerHTML={{ __html: html }} />
      );
    } else {
      nodes.push(
        <p key={item.id} dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
  });
  flushList();

  return nodes;
};

const SectionPreview = ({ templates }: SectionPreviewProps) => {
  const visible = templates.filter(
    (template) =>
      template.title.trim() ||
      template.section_type.trim() ||
      template.description?.trim() ||
      template.items.some((item) => visibleItemHtml(item).trim())
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Hidden text stays in the document on the left. This preview only shows what would export.
      </p>
    );
  }

  return (
    <div className="space-y-8 text-sm leading-relaxed **:data-cv-hidden:hidden [&_strong]:font-semibold [&_em]:italic [&_s]:line-through [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5">
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
          <div className="space-y-2">{renderItems(template.items)}</div>
        </section>
      ))}
    </div>
  );
};

export default SectionPreview;
