import { useEffect, useState } from "react";

type Added = { sectionId: number; entryId: string };

// Toolbars and menus float outside what they are for.
const FLOATING = "[data-floating-ui-portal], [data-radix-popper-content-wrapper], [role=dialog]";

/**
 * A section just added on the page, which offers a place to write until the
 * focus leaves it or the view changes.
 */
export const useAddedSection = (onPage: boolean) => {
  const [added, setAdded] = useState<Added | null>(null);
  if (added && !onPage) setAdded(null);
  const sectionId = added?.sectionId;

  useEffect(() => {
    if (sectionId === undefined) return;
    let entered = false;
    let pressed = false;
    const isIn = (element: Element | null) =>
      element !== null &&
      (element.closest(`[data-cv-page] [data-section-id="${sectionId}"]`) !== null || element.closest(FLOATING) !== null);
    const check = () => {
      // Another window's focus comes back.
      if (!entered || pressed || !document.hasFocus()) return;
      if (!isIn(document.activeElement)) setAdded(null);
    };
    const ended = new AbortController();
    const options = { capture: true, signal: ended.signal };
    document.addEventListener(
      "focusin",
      ({ target }) => {
        if (target instanceof Element && target.closest(`[data-section-id="${sectionId}"]`)) entered = true;
        check();
      },
      options
    );
    document.addEventListener("focusout", () => setTimeout(check), options);
    // Taking it away moves the page, so a press elsewhere ends first, with its click.
    document.addEventListener("pointerdown", () => (pressed = true), options);
    ["pointerup", "pointercancel"].forEach((name) =>
      document.addEventListener(
        name,
        () => {
          pressed = false;
          setTimeout(check);
        },
        options
      )
    );
    return () => ended.abort();
  }, [sectionId]);

  return [added, setAdded] as const;
};
