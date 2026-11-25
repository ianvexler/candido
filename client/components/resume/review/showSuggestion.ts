import type { CvSuggestion } from "@/lib/types";

// While it is scrolled to from far away, at most.
const FRAMES = 90;

let latest = 0;

/** Its text, once its editor is there to highlight it. */
const highlightOf = (s: CvSuggestion) => document.querySelector(`[data-suggestion-id="${s.id}"]`);

const placeOf = (s: CvSuggestion) => {
  const section = document.querySelector(`[data-section-id="${s.curriculum_section_id}"]`);
  const entry = s.entry_id && section?.querySelector(`[data-entry-id="${CSS.escape(s.entry_id)}"]`);
  return (s.field === "description" && entry && entry.querySelector(".rc-summary")) || entry || section;
};

/**
 * Brings a suggestion's text into view, or its place until that loads: on the
 * page an entry's editor does when it comes near the screen.
 */
export const showSuggestion = (s: CvSuggestion) => {
  const call = ++latest;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  const scrollTo = (element: Element | null | undefined) => element?.scrollIntoView({ behavior, block: "center" });

  // The user looks elsewhere.
  const ended = new AbortController();
  ["wheel", "pointerdown", "keydown"].forEach((name) =>
    window.addEventListener(name, () => ended.abort(), { capture: true, passive: true, signal: ended.signal })
  );

  let frames = 0;
  const attempt = () => {
    if (call !== latest) ended.abort();
    if (ended.signal.aborted) return;
    const highlight = highlightOf(s);
    if (highlight) {
      ended.abort();
      return scrollTo(highlight);
    }
    if (frames === 0) scrollTo(placeOf(s));
    frames += 1;
    // A summary has no highlight to wait for.
    if (frames < FRAMES && s.field !== "description") requestAnimationFrame(attempt);
    else ended.abort();
  };
  // The tab it is on may have to come first.
  requestAnimationFrame(() => requestAnimationFrame(attempt));
};
