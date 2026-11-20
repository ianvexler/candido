const HIDDEN_SELECTOR = "[data-cv-hidden]";

/**
 * The editor appends an empty paragraph after a trailing list. Strip it so that
 * opening a section doesn't count as an edit. The server strips it the same way.
 */
export const normalizeContent = (html: string) =>
  html.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+$/, "");

/** Removes hidden spans so only exportable text is left. */
export const stripHiddenHtml = (html: string) => {
  if (typeof window === "undefined") {
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
