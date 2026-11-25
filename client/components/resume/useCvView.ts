import { useState } from "react";

/** How a CV is edited: as cards, or on its page. */
export type CvView = "cards" | "page";

const KEY = "candido:cv-view";

// Storage can be blocked or full.
const stored = (): CvView => {
  try {
    return localStorage.getItem(KEY) === "page" ? "page" : "cards";
  } catch {
    return "cards";
  }
};

/** The view chosen last in this browser. */
export const useCvView = () => {
  const [view, setView] = useState<CvView>(() => (typeof window === "undefined" ? "cards" : stored()));

  const choose = (next: CvView) => {
    setView(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // For this page only, then.
    }
  };

  return [view, choose] as const;
};
