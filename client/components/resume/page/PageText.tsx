"use client";

import { ClipboardEvent, DragEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import "./page.css";
import type { TextBinding } from "./PageEditing";

/** Line breaks and tabs, with any spaces around them, become one space. Other spaces stay. */
export const oneLine = (text: string) =>
  text.replace(/[ \t\n\v\f\r\u0085\u2028\u2029]+/g, (run) => (/[^ ]/.test(run) ? " " : run));

/** Spaced as the printed element shows it, which has its text trimmed and its spaces collapsed. */
const asPrinted = (text: string) => oneLine(text).replace(/ +/g, " ").trim();

const readText = (element: HTMLElement) => oneLine(element.textContent ?? "");

const isFocused = (element: HTMLElement) => element.ownerDocument.activeElement === element;

// Placeholders are drawn from this; CSS alone can't tell text from a <br> left when all is deleted.
const markEmpty = (element: HTMLElement) => element.toggleAttribute("data-empty", !element.textContent);

const setText = (element: HTMLElement, text: string) => {
  // Rewriting the same text would drop the browser's undo for nothing.
  if (element.textContent !== text) element.textContent = text;
  markEmpty(element);
};

/** Types over the selection, through the browser so that its undo has it. False if it can't. */
const insertText = (text: string) => document.execCommand?.("insertText", false, text) ?? false;

const insertWithoutUndo = (element: HTMLElement, text: string) => {
  const selection = getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  element.normalize();
};

/** Safari's Enter that ends a composition comes after its end, with this code. */
const isComposingKey = ({ nativeEvent }: KeyboardEvent) => nativeEvent.isComposing || nativeEvent.keyCode === 229;

const selectDropPoint = ({ clientX, clientY }: DragEvent) => {
  const position = document.caretPositionFromPoint?.(clientX, clientY);
  if (position) return getSelection()?.collapse(position.offsetNode, position.offset);
  const range = document.caretRangeFromPoint?.(clientX, clientY);
  if (range) getSelection()?.collapse(range.startContainer, range.startOffset);
};

interface PageTextProps {
  as: "h1" | "h2" | "h3" | "p";
  className: string;
  binding: TextBinding;
  /** The element's data-block, for one that is a block of its own. */
  block?: string;
}

/**
 * One line of text edited in the printed element itself. The DOM holds the text,
 * not React, so nothing replaces what is being typed or the browser's undo.
 */
export const PageText = ({ as: As, className, binding, block }: PageTextProps) => {
  const { value, label, open, placeholder } = binding;
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);
  const [focused, setFocused] = useState(false);
  const latest = useRef(binding);
  const composing = useRef(false);
  /** What the owner knows the text to be, so one change isn't reported twice. */
  const known = useRef("");
  /** The value when a report was made, until the owner answers with another. */
  const unanswered = useRef<string | null>(null);
  /** The text when it was entered, for one that can't be left blank. */
  const entered = useRef("");

  // Stays while focused, so clearing the text doesn't take the field away.
  const visible = Boolean(open || focused || value.trim());

  const takeValue = () => {
    const element = ref.current;
    if (!element || composing.current || isFocused(element)) return;
    // Typed text whose report isn't answered yet is newer than the value.
    const text = unanswered.current === null ? latest.current.value : known.current;
    setText(element, asPrinted(text));
    known.current = readText(element);
  };

  const report = () => {
    const element = ref.current;
    if (!element) return;
    markEmpty(element);
    if (composing.current) return;
    const typed = readText(element);
    const text = latest.current.required && !typed.trim() ? entered.current : typed;
    if (text === known.current) return;
    known.current = text;
    unanswered.current = latest.current.value;
    latest.current.onChange(text);
  };

  const enter = () => {
    if (latest.current.onEnter) latest.current.onEnter();
    else ref.current?.blur();
  };

  useLayoutEffect(() => {
    latest.current = binding;
  });

  useLayoutEffect(() => {
    unanswered.current = null;
    takeValue();
  }, [value, visible]);

  // Taken away while composing, as by a tick: no event ends that.
  useLayoutEffect(
    () => () => {
      composing.current = false;
      report();
    },
    []
  );

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    try {
      element.contentEditable = "plaintext-only";
    } catch {
      element.setAttribute("contenteditable", "true");
    }
  }, [visible]);

  // React's onBeforeInput isn't the browser's event and has no inputType.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onBeforeInput = (event: InputEvent) => {
      const breaks = event.inputType === "insertParagraph" || event.inputType === "insertLineBreak";
      if (!breaks && !event.inputType.startsWith("format")) return;
      event.preventDefault();
      // On-screen keyboards send Enter only as this.
      if (breaks) enter();
    };
    element.addEventListener("beforeinput", onBeforeInput);
    return () => element.removeEventListener("beforeinput", onBeforeInput);
  }, [visible]);

  if (!visible) return null;

  const insert = (text: string) => {
    const element = ref.current;
    const line = oneLine(text.replace(/^[\r\n]+|[\r\n]+$/g, ""));
    if (!element || !line) return;
    if (!insertText(line)) insertWithoutUndo(element, line);
    report();
  };

  const handlePaste = (event: ClipboardEvent) => {
    event.preventDefault();
    insert(event.clipboardData.getData("text/plain"));
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const text = event.dataTransfer.getData("text/plain");
    // The browser's own drop of one plain line also moves text within the field.
    const plain = event.currentTarget.getAttribute("contenteditable") !== "true";
    if (plain && oneLine(text) === text) return;
    event.preventDefault();
    event.currentTarget.focus();
    selectDropPoint(event);
    insert(text);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isComposingKey(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      enter();
    } else if (event.key === "Escape") {
      ref.current?.blur();
    }
  };

  const handleFocus = () => {
    setFocused(true);
    // Not when coming back from another window with the field cleared.
    const text = ref.current && readText(ref.current);
    if (text?.trim()) entered.current = text;
  };

  const handleCompositionEnd = () => {
    composing.current = false;
    report();
  };

  const handleBlur = () => {
    // Another window took the focus: this is still the field being typed in.
    if (ref.current && isFocused(ref.current)) return;
    handleCompositionEnd();
    setFocused(false);
    takeValue();
  };

  return (
    <As
      ref={ref}
      className={cn(className, "page-text")}
      data-block={block}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onInput={report}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={handleCompositionEnd}
    />
  );
};
