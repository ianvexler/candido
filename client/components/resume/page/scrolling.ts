/** What scrolls the element, or null for the document. */
export const scrollParent = (element: Element): Element | null => {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
};

/** The part of the viewport it shows. */
export const viewOf = (scroller: Element): { top: number; bottom: number } =>
  scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
