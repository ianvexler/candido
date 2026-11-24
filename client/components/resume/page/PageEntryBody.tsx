"use client";

import "@/components/richEditor/styles.scss";
import "./page.css";
import type { SectionEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from "@floating-ui/react";
import { TextSelection } from "@tiptap/pm/state";
import { Editor, EditorContent } from "@tiptap/react";
import { memo, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { printedHtml } from "../documentContent";
import { BlockToolbar, FormatBubble } from "../EditorControls";
import { contentExtensionsWith } from "../review/replaceInContent";
import { OnEntryChange, useEntryEditor } from "../useEntryEditor";
import { highlightClasses, SuggestionProps, useEntrySuggestions } from "../useEntrySuggestions";
import HiddenGuard from "./HiddenGuard";
import PrintedBlocks from "./PrintedBlocks";
import PrivateCopy from "./PrivateCopy";
import ShownCode from "./ShownCode";

const PAGE_EXTENSIONS = [
  // Pressing a link edits its text. New code isn't offered: making it would show hidden text.
  ...contentExtensionsWith({ link: { openOnClick: false }, codeBlock: false }),
  ShownCode,
  HiddenGuard,
  PrivateCopy,
  PrintedBlocks,
];

interface PageEntryBodyProps extends SuggestionProps {
  entry: SectionEntry;
  /** From useSectionDrafts. The editor is remounted when it changes. */
  version: number;
  onEntryChange: OnEntryChange;
  editors: RefObject<Map<string, Editor>>;
  /** Near the screen: loads its editor, which then stays. */
  near: boolean;
  /** Offers the editor even with nothing in it. */
  open?: boolean;
}

/** Floats over the page, out of its layout and its scale. */
const FloatingToolbar = ({ editor }: { editor: Editor }) => {
  const {
    refs: { setReference, setFloating },
    floatingStyles,
  } = useFloating({
    placement: "bottom-start",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  useLayoutEffect(() => setReference(editor.view.dom), [setReference, editor]);
  return (
    <FloatingPortal>
      <div ref={setFloating} style={floatingStyles} className="z-20 print:hidden">
        <BlockToolbar editor={editor} />
      </div>
    </FloatingPortal>
  );
};

type LoadedBodyProps = Omit<PageEntryBodyProps, "near" | "open"> & {
  takeFocusRef: RefObject<boolean>;
};

const LoadedBody = ({ entry, version, onEntryChange, editors, takeFocusRef, ...suggestionProps }: LoadedBodyProps) => {
  const editor = useEntryEditor({
    entry,
    version,
    onChange: onEntryChange,
    editors,
    placeholder: "Write here. Start a line with - for bullets.",
    className: cn("page-editor", highlightClasses),
    extensions: PAGE_EXTENSIONS,
    // So that it is there for the press that loaded it.
    immediatelyRender: true,
  });
  const { card, onEditorClick } = useEntrySuggestions({
    entry,
    version,
    onEntryChange,
    editor,
    editors,
    // The page shows the summary without its suggestions.
    summaryOff: true,
    ...suggestionProps,
  });
  const [focused, setFocused] = useState(false);
  // The bar over a selection stays once used, as its link field takes the focus.
  const [used, setUsed] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const onFocus = () => {
      setFocused(true);
      setUsed(true);
    };
    const onBlur = () => setFocused(false);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !takeFocusRef.current) return;
    takeFocusRef.current = false;
    editor.view.focus();
  }, [editor, takeFocusRef]);

  return (
    <>
      <EditorContent editor={editor} onClick={onEditorClick} />
      {editor && used && <FormatBubble editor={editor} appendTo={pageBody} />}
      {editor && focused && <FloatingToolbar editor={editor} />}
      {card}
    </>
  );
};

/**
 * The press that loaded an editor still goes to what it replaced, so the browser
 * neither puts the caret nor selects as it is dragged.
 */
const takePress = (editor: Editor, press: React.MouseEvent) => {
  const { view } = editor;
  const posAt = ({ clientX, clientY }: { clientX: number; clientY: number }) =>
    view.posAtCoords({ left: clientX, top: clientY })?.pos;
  const anchor = posAt(press);
  if (anchor === undefined) return;
  press.preventDefault();

  const select = (head: number) => {
    const { doc } = view.state;
    view.dispatch(view.state.tr.setSelection(TextSelection.between(doc.resolve(Math.min(anchor, doc.content.size)), doc.resolve(head))));
  };
  view.focus();
  select(anchor);

  const onMove = (event: MouseEvent) => {
    const head = editor.isDestroyed ? undefined : posAt(event);
    if (head !== undefined) select(head);
  };
  const ended = new AbortController();
  window.addEventListener("mousemove", onMove, { signal: ended.signal });
  window.addEventListener("mouseup", () => ended.abort(), { signal: ended.signal });
};

const pageBody = () => document.body;

/**
 * An entry's content on the page: as it prints until it is near the screen or
 * pressed, then its editor, in the same place.
 */
const PageEntryBody = ({ near, open = false, ...body }: PageEntryBodyProps) => {
  const { entry, version } = body;
  const [loaded, setLoaded] = useState(near);
  if (near && !loaded) setLoaded(true);
  const [focusWithin, setFocusWithin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const takeFocusRef = useRef(false);
  const html = printedHtml(entry.content);

  // A remounted editor takes its focus with it, without a blur.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!ref.current?.contains(document.activeElement)) setFocusWithin(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [version]);

  // Stays while focused, so clearing the text doesn't take the editor away.
  if (!html && !open && !focusWithin) return null;

  return (
    <div
      ref={ref}
      className="page-entry-body"
      // Before the press itself, so that it puts the caret in the editor.
      onPointerDown={loaded ? undefined : () => flushSync(() => setLoaded(true))}
      onMouseDown={(event) => {
        const editor = event.target === ref.current ? body.editors.current.get(entry.id) : undefined;
        if (editor && event.button === 0) takePress(editor, event);
      }}
      onFocus={() => {
        setFocusWithin(true);
        if (loaded) return;
        takeFocusRef.current = true;
        setLoaded(true);
      }}
      onBlur={(event) => {
        const body = event.currentTarget;
        // Another window took the focus: this is still what is being written in.
        const stays = body.contains(event.relatedTarget) || body.contains(document.activeElement);
        // The static content's, as its editor takes its place.
        if (!stays && !takeFocusRef.current) setFocusWithin(false);
      }}
    >
      {loaded ? (
        <LoadedBody key={version} {...body} takeFocusRef={takeFocusRef} />
      ) : (
        <div
          role="textbox"
          aria-multiline
          aria-label="Content"
          tabIndex={0}
          dangerouslySetInnerHTML={{ __html: html || "<p>​</p>" }}
        />
      )}
    </div>
  );
};

export default memo(PageEntryBody);
