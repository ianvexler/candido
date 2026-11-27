import { MODIFIERS } from "./editChannel";

const NOT_TEXT = ["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"];

const isTextField = (target: EventTarget | null) => {
  if (target instanceof HTMLInputElement) return !NOT_TEXT.includes(target.type);
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.closest('[contenteditable]:not([contenteditable="false"])') !== null)
  );
};

/**
 * Watches from a press on, for what takes a while. The result ends that and
 * says whether the user has gone on to type or write meanwhile.
 */
export const watchMovedOn = () => {
  let moved = false;
  const ended = new AbortController();
  const options = { capture: true, signal: ended.signal };
  window.addEventListener(
    "keydown",
    (event) => {
      if (!event.repeat && !MODIFIERS.includes(event.key)) moved = true;
    },
    options
  );
  window.addEventListener(
    "focusin",
    ({ target }) => {
      if (isTextField(target)) moved = true;
    },
    options
  );
  return () => {
    ended.abort();
    return moved;
  };
};
