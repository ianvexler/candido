import { listItems, mergeEdited, visibleContent } from "@/lib/resume/items";
import type { SectionEntry } from "@/lib/types";
import type { Extensions } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Editor, useEditor } from "@tiptap/react";
import { RefObject, useEffect, useMemo, useState } from "react";
import { normalizeContent } from "./documentContent";
import { contentExtensions } from "./review/replaceInContent";

export type EntryChange = Partial<SectionEntry> | ((latest: SectionEntry) => Partial<SectionEntry>);

/**
 * A function gets the latest entry, which may be newer than the one shown. Without
 * a version the change isn't the editor's, and is put into it, as is that of one
 * that is gone.
 */
export type OnEntryChange = (id: string, changes: EntryChange, version?: number, gone?: boolean) => void;

interface EntryEditorOptions {
  entry: SectionEntry;
  /** From useSectionDrafts. Remount the component when it changes. */
  version: number;
  onChange: OnEntryChange;
  /** The editor on screen for each entry, as it may have been remounted since. */
  editors: RefObject<Map<string, Editor>>;
  placeholder: string;
  className: string;
  /** What it reads and writes, and more. Read once. */
  extensions?: Extensions;
  /** Has the editor on the first render, where that never happens on the server. */
  immediatelyRender?: boolean;
}

/** The text editor of an entry's content. Uncontrolled: it loads the content once. */
export const useEntryEditor = ({
  entry,
  version,
  onChange,
  editors,
  placeholder,
  className,
  extensions = contentExtensions,
  immediatelyRender = false,
}: EntryEditorOptions): Editor | null => {
  // It has ticked items only; the rest are put back into what it reports.
  const [loaded] = useState(() => ({
    content: visibleContent(entry.content),
    hidden: listItems(entry.content).filter((item) => item.off).map((item) => item.id),
    extensions: [...extensions, Placeholder.configure({ placeholder })],
  }));
  // The same objects each time: TipTap takes new ones as a change of settings.
  const editorProps = useMemo(() => ({ attributes: { "aria-label": "Content", class: className } }), [className]);
  const editor = useEditor({
    extensions: loaded.extensions,
    immediatelyRender,
    content: loaded.content || "<p></p>",
    editorProps,
    onUpdate: ({ editor: current }) => {
      const visible = current.getHTML();
      onChange(
        entry.id,
        (latest) => ({ content: normalizeContent(mergeEdited(latest.content, visible, loaded.hidden)) }),
        version
      );
    },
  });
  useEffect(() => {
    if (!editor) return;
    const shown = editors.current;
    shown.set(entry.id, editor);
    return () => {
      if (shown.get(entry.id) === editor) shown.delete(entry.id);
    };
  }, [editor, editors, entry.id]);

  return editor;
};
