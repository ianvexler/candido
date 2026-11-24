import type { KeptPlace } from "@/lib/resume/exportDocument";

/** The section and entry an element of the page is in. */
export const placeOf = (element: Element): KeptPlace | null => {
  const section = element.closest("[data-section-id]")?.getAttribute("data-section-id");
  return section
    ? { sectionId: Number(section), entryId: element.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? null }
    : null;
};
