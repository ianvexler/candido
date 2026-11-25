import { useCallback, useEffect, useRef } from "react";

/** As a card's field, or on the page. */
const headingOf = (id: number) =>
  document.querySelector<HTMLElement>(
    `[data-section-id="${id}"] input[aria-label="Section heading"], [data-section-id="${id}"] .rc-heading[contenteditable]`
  );

/** Puts the caret in the heading of a section just added, once it's on the page. */
export const useFocusNewSection = () => {
  const wanted = useRef<number | null>(null);

  useEffect(() => {
    if (wanted.current === null) return;
    const heading = headingOf(wanted.current);
    if (!heading) return;
    wanted.current = null;
    heading.focus();
    if (heading instanceof HTMLInputElement) heading.select();
    else getSelection()?.selectAllChildren(heading);
  });

  return useCallback((id: number) => {
    wanted.current = id;
  }, []);
};
