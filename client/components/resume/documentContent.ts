// Unticked items, and hidden text inside items.
const HIDDEN_SELECTOR = '[data-cv-off]:not([data-cv-off="false"]), [data-cv-hidden]';

/**
 * The editor appends an empty paragraph after a trailing list. Strip it so that
 * opening a section doesn't count as an edit. The server strips it the same way.
 */
export const normalizeContent = (html: string) =>
  html.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+$/, "");

/** Removes unticked items and hidden spans so only exportable text is left. */
export const stripHiddenHtml = (html: string) => {
  if (typeof window === "undefined") {
    // Left-out text must never leak, and a regex can't remove whole items.
    if (/data-cv-off/i.test(html)) throw new Error("Unticked items can't be removed without a DOM");
    return html.replace(/<span[^>]*data-cv-hidden[^>]*>[\s\S]*?<\/span>/gi, "");
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll(HIDDEN_SELECTOR).forEach((node) => node.remove());

  // Drop blocks (bullets, paragraphs, headings) left empty once hidden text is gone.
  container.querySelectorAll("li, p, h1, h2, h3, h4, h5, h6, blockquote").forEach((node) => {
    if (!node.textContent?.trim()) node.remove();
  });
  container.querySelectorAll("ul, ol").forEach((list) => {
    if (!list.querySelector("li")) list.remove();
  });

  return container.innerHTML;
};

export const hasVisibleText = (html: string) =>
  stripHiddenHtml(html).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
