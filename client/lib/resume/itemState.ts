import { EntryFieldKeys, EntryFields } from "@/lib/types";
import { ITEM_ATTRIBUTE, OFF_ATTRIBUTE, isSeparator, parseHtml } from "./items";
import { cleanLine } from "./sectionEntries";

/** How a CV's text stands against the library's. "differs": it isn't known which side changed. */
export type ItemState =
  | "same"
  | "cv_changed"
  | "library_changed"
  | "both_changed"
  | "differs"
  | "cv_only"
  | "library_only";

/** Collapses spaces as a browser does when showing them. */
const collapseSpaces = (container: Element) => {
  // The text before in the same line, if any.
  let previous: Text | null = null;

  const endLine = () => {
    if (previous) previous.data = previous.data.replace(/ $/, "");
    previous = null;
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      text.data = text.data.replace(/[ \t\r\n\f]+/g, " ");
      if (!previous || previous.data.endsWith(" ")) text.data = text.data.replace(/^ /, "");
      if (text.data) previous = text;
      return;
    }
    const separator = isSeparator(node);
    if (separator) endLine();
    node.childNodes.forEach(visit);
    if (separator) endLine();
  };
  visit(container);
  endLine();
};

/** Puts text straight inside list items into paragraphs. */
const wrapListText = (container: Element) =>
  container.querySelectorAll("li").forEach((item) => {
    let paragraph: Element | null = null;
    Array.from(item.childNodes).forEach((node) => {
      if (isSeparator(node) && node.nodeName !== "BR") {
        paragraph = null;
        return;
      }
      if (!paragraph) {
        paragraph = item.ownerDocument.createElement("p");
        node.before(paragraph);
      }
      paragraph.append(node);
    });
  });

/**
 * Without ids, ticks, formatting whitespace, and hidden marks, which the library
 * doesn't have. Also without what the editor adds on its own: link rel and
 * target, and paragraphs in list items.
 */
const normalize = (html: string): Element => {
  const container = parseHtml(html);
  container.querySelectorAll("span[data-cv-hidden]").forEach((span) => span.replaceWith(...span.childNodes));
  container.querySelectorAll("*").forEach((node) => {
    node.removeAttribute(ITEM_ATTRIBUTE);
    node.removeAttribute(OFF_ATTRIBUTE);
  });
  container.querySelectorAll("a").forEach((link) => {
    link.removeAttribute("rel");
    link.removeAttribute("target");
  });
  collapseSpaces(container);
  container.normalize();
  wrapListText(container);
  return container;
};

const sameHtml = (a: string, b: string) => a === b || normalize(a).isEqualNode(normalize(b));

const cleanValue = (fields: EntryFields, key: keyof EntryFields) => {
  const value = fields[key];
  if (key === "current") return Boolean(value);
  if (key === "end_date" && fields.current) return null;
  return key === "description" ? (value as string | null)?.trim() || null : cleanLine((value as string | null) ?? null);
};

const sameEntryFields = (a: EntryFields, b: EntryFields) =>
  EntryFieldKeys.every((key) => cleanValue(a, key) === cleanValue(b, key));

const compare = <T>(cv: T | null, library: T | null, base: T | null, same: (a: T, b: T) => boolean): ItemState => {
  // Loose: a missing key in base_items gives undefined.
  if (cv == null) return library == null ? "same" : "library_only";
  if (library == null) return "cv_only";
  if (same(cv, library)) return "same";
  if (base == null) return "differs";
  if (same(library, base)) return "cv_changed";
  return same(cv, base) ? "library_changed" : "both_changed";
};

/** Each side's html of one item, null where it is absent. `base` is the library html last matched with. */
export const itemState = (cv: string | null, library: string | null, base: string | null): ItemState =>
  compare(cv, library, base, sameHtml);

/** The same for an entry's own fields. */
export const fieldsState = (
  cv: EntryFields | null,
  library: EntryFields | null,
  base: EntryFields | null
): ItemState => compare(cv, library, base, sameEntryFields);
