import type { Editor } from "@tiptap/core";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { SectionTemplateItem, SectionTemplateItemKind } from "@/lib/types";

export type DocumentItemDraft = {
  kind: SectionTemplateItemKind;
  body: string;
  hidden: boolean;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const looksLikeHtml = (value: string) =>
  /<\/?[a-z][\s\S]*>/i.test(value) || value.includes("data-cv-hidden");

const wrapHidden = (inner: string, hidden: boolean) => {
  if (!hidden || inner.includes("data-cv-hidden")) return inner;
  return `<span data-cv-hidden="true">${inner}</span>`;
};

const itemInner = (item: Pick<SectionTemplateItem, "body" | "hidden">) => {
  const inner = looksLikeHtml(item.body) ? item.body : escapeHtml(item.body);
  return wrapHidden(inner, item.hidden);
};

export const itemsToHtml = (items: SectionTemplateItem[]) => {
  if (items.length === 0) return "<p></p>";

  const parts: string[] = [];
  let listItems: SectionTemplateItem[] = [];
  let listKind: "bullet" | "ordered" | null = null;

  const flushList = () => {
    if (listItems.length === 0 || !listKind) return;
    const tag = listKind === "ordered" ? "ol" : "ul";
    parts.push(
      `<${tag}>${listItems.map((item) => `<li><p>${itemInner(item)}</p></li>`).join("")}</${tag}>`
    );
    listItems = [];
    listKind = null;
  };

  items.forEach((item) => {
    if (item.kind === "bullet" || item.kind === "ordered") {
      if (listKind && listKind !== item.kind) flushList();
      listKind = item.kind;
      listItems.push(item);
      return;
    }

    flushList();
    if (item.kind === "heading") {
      parts.push(`<h3>${itemInner(item)}</h3>`);
    } else {
      parts.push(`<p>${itemInner(item)}</p>`);
    }
  });
  flushList();

  return parts.join("");
};

const wrapMarks = (text: string, marks: readonly Mark[]) => {
  let html = escapeHtml(text);
  const names = new Set(marks.map((mark) => mark.type.name));

  if (names.has("code")) html = `<code>${html}</code>`;
  if (names.has("bold")) html = `<strong>${html}</strong>`;
  if (names.has("italic")) html = `<em>${html}</em>`;
  if (names.has("strike")) html = `<s>${html}</s>`;

  const link = marks.find((mark) => mark.type.name === "link");
  if (link?.attrs.href) {
    html = `<a href="${escapeHtml(String(link.attrs.href))}">${html}</a>`;
  }
  if (names.has("hidden")) html = `<span data-cv-hidden="true">${html}</span>`;

  return html;
};

const serializeText = (node: PMNode) => {
  let html = "";
  let text = "";
  let hasText = false;
  let fullyHidden = true;

  const walk = (current: PMNode) => {
    if (current.isText) {
      const value = current.text ?? "";
      if (value.length === 0) return;
      hasText = true;
      text += value;
      const hidden = current.marks.some((mark) => mark.type.name === "hidden");
      if (!hidden) fullyHidden = false;
      html += wrapMarks(value, current.marks);
      return;
    }
    current.forEach(walk);
  };

  walk(node);
  if (!hasText) fullyHidden = false;
  return { html, text, fullyHidden };
};

const pushItem = (items: DocumentItemDraft[], kind: SectionTemplateItemKind, node: PMNode) => {
  const serialized = serializeText(node);
  if (!serialized.text.trim()) return;
  items.push({ kind, body: serialized.html, hidden: serialized.fullyHidden });
};

export const itemsFromEditor = (editor: Editor): DocumentItemDraft[] => {
  const items: DocumentItemDraft[] = [];

  editor.state.doc.forEach((node) => {
    if (node.type.name === "bulletList") {
      node.forEach((listItem) => pushItem(items, "bullet", listItem));
      return;
    }
    if (node.type.name === "orderedList") {
      node.forEach((listItem) => pushItem(items, "ordered", listItem));
      return;
    }
    if (node.type.name === "heading") {
      pushItem(items, "heading", node);
      return;
    }
    if (node.type.name === "paragraph" || node.type.name === "blockquote") {
      pushItem(items, "paragraph", node);
    }
  });

  return items;
};

export const stripHiddenHtml = (html: string) => {
  if (typeof window === "undefined") {
    return html.replace(/<span[^>]*data-cv-hidden[^>]*>[\s\S]*?<\/span>/gi, "");
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("[data-cv-hidden]").forEach((node) => node.remove());
  return container.innerHTML;
};

export const visibleItemHtml = (item: SectionTemplateItem) => {
  if (item.hidden) return "";
  if (!looksLikeHtml(item.body)) return escapeHtml(item.body);
  return stripHiddenHtml(item.body);
};
