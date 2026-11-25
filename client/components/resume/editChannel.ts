import { createContext } from "react";

/** A place in the CV to put the caret in. */
export type EditTarget = { sectionId: number } & (
  | { what: "heading"; /** Selects its text. */ selected?: boolean }
  | { what: "title" | "summary" | "details" | "bullet"; entryId: string }
  | { what: "item"; entryId: string; itemId: string }
);

/** Goes there and says so, or says it isn't there (yet). */
export type EditHandler = (target: EditTarget) => boolean;

const LIMIT_MS = 4000;
const MODIFIERS = ["Shift", "Control", "Alt", "Meta"];

/**
 * Passes "go there and edit" on to whichever view is on the screen. What isn't there
 * yet, as after a tick, is waited for until the user does something else.
 */
export const createEditChannel = () => {
  const handlers = new Set<EditHandler>();
  let asked: AbortController | null = null;

  const stop = () => asked?.abort();

  const ask = (target: EditTarget) => {
    stop();
    const attempt = () => [...handlers].some((handler) => handler(target));
    if (attempt()) return;

    const now = new AbortController();
    asked = now;
    const options = { capture: true, signal: now.signal };
    window.addEventListener("pointerdown", stop, options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (!event.repeat && !MODIFIERS.includes(event.key)) stop();
      },
      options
    );
    const end = performance.now() + LIMIT_MS;
    const again = () => {
      if (now.signal.aborted) return;
      if (attempt() || performance.now() > end) now.abort();
      else requestAnimationFrame(again);
    };
    requestAnimationFrame(again);
  };

  const handle = (handler: EditHandler) => {
    handlers.add(handler);
    return () => void handlers.delete(handler);
  };

  return { ask, handle, stop };
};

export type EditChannel = ReturnType<typeof createEditChannel>;

/** Null in the library, which has no checklist. */
export const EditChannelContext = createContext<EditChannel | null>(null);
