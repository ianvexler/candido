"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { Editor } from "@tiptap/react";
import { KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ITEM_ATTRIBUTE } from "@/lib/resume/items";
import { cn } from "@/lib/utils";
import { LEAVE_OUT_BUTTON, LEAVE_OUT_SPACE } from "./styles";

const ITEM_SELECTOR = `[${ITEM_ATTRIBUTE}]`;

type Place = { id: string; top: number };

interface LeaveOutAreaProps {
  editor: Editor;
  /** A suggestion's card is open, which Escape closes. */
  cardOpen: boolean;
  /** `focusAt` is where the caret should go afterwards, or null if focus was elsewhere. */
  onLeaveOut: (itemId: string, focusAt: number | null) => void;
  children: ReactNode;
}

/** The item that an element is (in), unless it is blank. */
export const offerableItem = (element: Element | null): Element | null => {
  const item = element?.closest(ITEM_SELECTOR) ?? null;
  return item?.textContent?.trim() ? item : null;
};

const caretItem = (editor: Editor): Element | null => {
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  return offerableItem(node instanceof Element ? node : node.parentElement);
};

/**
 * Puts "Leave out" beside the item that is pointed at or has the caret. It isn't
 * part of the document. Escape moves from the text to the button and back.
 */
const LeaveOutArea = ({ editor, cardOpen, onLeaveOut, children }: LeaveOutAreaProps) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState<Place | null>(null);
  const [caret, setCaret] = useState<Place | null>(null);
  const place = hovered ?? caret;

  const placeOf = useCallback((item: Element | null): Place | null => {
    const area = areaRef.current;
    const id = item?.getAttribute(ITEM_ATTRIBUTE);
    if (!area || !item || !id) return null;
    return { id, top: Math.round(item.getBoundingClientRect().top - area.getBoundingClientRect().top) };
  }, []);

  const showCaret = useCallback(() => {
    if (editor.isDestroyed) return;
    const next = editor.isFocused ? placeOf(caretItem(editor)) : null;
    setCaret((now) => (now?.id === next?.id && now?.top === next?.top ? now : next));
  }, [editor, placeOf]);

  useEffect(() => {
    const onEdit = () => {
      showCaret();
      // What is pointed at may have moved.
      setHovered(null);
    };
    const onBlur = ({ event }: { event: FocusEvent }) => {
      // The button itself may be what took focus.
      if (!areaRef.current?.contains(event.relatedTarget as Node | null)) setCaret(null);
    };
    editor.on("selectionUpdate", showCaret);
    editor.on("focus", showCaret);
    editor.on("update", onEdit);
    editor.on("blur", onBlur);
    return () => {
      editor.off("selectionUpdate", showCaret);
      editor.off("focus", showCaret);
      editor.off("update", onEdit);
      editor.off("blur", onBlur);
    };
  }, [editor, showCaret]);

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || event.buttons > 0) return;
    const target = event.target as Element;
    // Between items, or on the button: as it was.
    if (!target.closest(ITEM_SELECTOR)) return;
    const item = offerableItem(target);
    const next = placeOf(item);
    setHovered((now) => (now?.id === next?.id && now?.top === next?.top ? now : next));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (cardOpen || event.key !== "Escape" || event.nativeEvent.isComposing) return;
    if (event.target === buttonRef.current) {
      editor.commands.focus();
    } else if (caret) {
      // It is the caret's item that is meant.
      setHovered(null);
      requestAnimationFrame(() => buttonRef.current?.focus());
    }
  };

  const leaveOut = () => {
    if (!place) return;
    const item = editor.view.dom.querySelector(`[${ITEM_ATTRIBUTE}="${CSS.escape(place.id)}"]`);
    const focused = editor.isFocused || document.activeElement === buttonRef.current;
    onLeaveOut(place.id, focused && item ? editor.view.posAtDOM(item, 0) : null);
  };

  return (
    <div
      ref={areaRef}
      className={cn("relative", LEAVE_OUT_SPACE)}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
      // Before the card closes, so it counts as open.
      onKeyDownCapture={onKeyDown}
    >
      {children}
      {place && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={buttonRef}
              type="button"
              // Keeps the caret where it is.
              onMouseDown={(event) => event.preventDefault()}
              onClick={leaveOut}
              onBlur={(event) => {
                if (!areaRef.current?.contains(event.relatedTarget)) setCaret(null);
              }}
              style={{ top: place.top }}
              className={LEAVE_OUT_BUTTON}
            >
              Leave out
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Only from this CV. From the text, press Escape, then Enter.</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default LeaveOutArea;
