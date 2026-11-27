// Toolbars and menus float outside what they are for.
const FLOATING = "[data-floating-ui-portal], [data-radix-popper-content-wrapper], [role=dialog]";

/**
 * Calls back once the focus, having been in a place, leaves it. `isIn` says whether
 * an element is in the place. Returns what stops it.
 */
export const whenLeft = (isIn: (element: Element) => boolean, onLeft: () => void): (() => void) => {
  const focused = () => document.activeElement;
  let entered = focused() !== null && isIn(focused()!);
  let pressed = false;
  const ended = new AbortController();
  const options = { capture: true, signal: ended.signal };

  const check = () => {
    // Another window's focus comes back.
    if (ended.signal.aborted || !entered || pressed || !document.hasFocus()) return;
    const element = focused();
    if (element && (isIn(element) || element.closest(FLOATING))) return;
    ended.abort();
    onLeft();
  };
  document.addEventListener(
    "focusin",
    ({ target }) => {
      if (target instanceof Element && isIn(target)) entered = true;
      setTimeout(check);
    },
    options
  );
  document.addEventListener("focusout", () => setTimeout(check), options);
  // Leaving moves what is on the screen, so a press elsewhere ends first, with its click.
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
};
