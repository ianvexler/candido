import { useState } from "react";

/** How a CV is edited: as cards, or on its page. */
export type CvView = "cards" | "page";

// Its own key, so the first stage's stored choice does not keep people on the cards.
const KEY = "candido:cv-view-2";

// Storage can be blocked or full.
const stored = (): CvView => {
  try {
    return localStorage.getItem(KEY) === "cards" ? "cards" : "page";
  } catch {
    return "page";
  }
};

/** The view chosen last in this browser. */
export const useCvView = () => {
  const [view, setView] = useState<CvView>(() => (typeof window === "undefined" ? "page" : stored()));

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
