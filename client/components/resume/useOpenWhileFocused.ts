import { FocusEvent, useCallback, useEffect, useRef, useState } from "react";

/**
 * Open from when it is asked for, or gets focus, until focus leaves. Closing
 * moves what is below, so it waits for a press elsewhere to end first: the
 * click would land on something else otherwise.
 */
export const useOpenWhileFocused = () => {
  const [open, setOpen] = useState(false);
  const pressed = useRef(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (!focused.current) setOpen(false);
    };
    const onDown = () => {
      pressed.current = true;
    };
    const onUp = () => {
      pressed.current = false;
      // After the click that follows.
      setTimeout(close);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      pressed.current = false;
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    };
  }, [open]);

  const onFocus = useCallback(() => {
    focused.current = true;
    setOpen(true);
  }, []);
  const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    // Switching windows blurs too, and the focus comes back.
    if (!document.hasFocus()) return;
    focused.current = false;
    if (!pressed.current) setOpen(false);
  }, []);

  return { open, setOpen, focusProps: { onFocus, onBlur } };
};
