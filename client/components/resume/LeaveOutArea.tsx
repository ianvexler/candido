"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { Editor } from "@tiptap/react";
import { KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ITEM_ATTRIBUTE } from "@/lib/resume/items";

const ITEM_SELECTOR = `[${ITEM_ATTRIBUTE}]`;

type Place = { id: string; top: number };

interface LeaveOutAreaProps {
  editor: Editor;
  /** `focusAt` is where the caret should go afterwards, or null if focus was elsewhere. */
  onLeaveOut: (itemId: string, focusAt: number | null) => void;
  children: ReactNode;
}

/** The item the caret is in, unless it is blank. */
const caretItem = (editor: Editor): HTMLElement | null => {
  const { node } = editor.view.domAtPos(editor.state.selection.from);
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>(ITEM_SELECTOR) ?? null;
};

/**
 * Puts "Leave out" beside the item that is pointed at or has the caret. It isn't
 * part of the document. Escape moves from the text to the button and back.
 */
const LeaveOutArea = ({ editor, onLeaveOut, children }: LeaveOutAreaProps) => {
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
    const item = (event.target as Element).closest(ITEM_SELECTOR);
    if (!item) return;
    const next = placeOf(item);
    setHovered((now) => (now?.id === next?.id && now?.top === next?.top ? now : next));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
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
      className="relative"
      onPointerMove={onPointerMove}
      onPointerLeave={() => setHovered(null)}
      onKeyDown={onKeyDown}
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
              className="absolute left-full w-10 rounded-md bg-white px-0.5 py-0.5 text-left text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:-ml-1.5 sm:w-auto sm:px-1 sm:whitespace-nowrap"
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
