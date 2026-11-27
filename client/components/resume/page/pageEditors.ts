import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";

/** The editors on the page, by section: two sections may have copies of one entry. */
export const createPageEditors = () => {
  const sections = new Map<number, RefObject<Map<string, Editor>>>();
  return {
    of: (sectionId: number): RefObject<Map<string, Editor>> => {
      const known = sections.get(sectionId);
      if (known) return known;
      const created = { current: new Map<string, Editor>() };
      sections.set(sectionId, created);
      return created;
    },
  };
};

export type PageEditors = ReturnType<typeof createPageEditors>;
