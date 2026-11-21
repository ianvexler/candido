import { Editor, Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findQuote } from "@/lib/resume/suggestions";

export type SuggestionItem = { id: number; quote: string };
export type SuggestionRange = { from: number; to: number };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    suggestionHighlight: {
      /** Highlights each quote's first match. View-only: the content never changes. */
      setSuggestions: (items: SuggestionItem[], activeId: number | null) => ReturnType;
    };
  }
}

/** Finds `quote` in one textblock and maps it to document positions, or null. */
const rangeInBlock = (block: PMNode, blockPos: number, quote: string): SuggestionRange | null => {
  const match = findQuote(block.textContent, quote);
  if (!match) return null;

  // Document position of each character of textContent. Inline leaves (e.g.
  // hard breaks) add no text but take a position, so a match across one is
  // not contiguous and is treated as not found.
  const positions: number[] = [];
  block.forEach((child, offset) => {
    if (!child.isText) return;
    const start = blockPos + 1 + offset;
    for (let i = 0; i < child.text!.length; i++) positions.push(start + i);
  });
  const from = positions[match.from];
  const to = positions[match.to - 1] + 1;
  if (from === undefined || Number.isNaN(to) || to - from !== match.to - match.from) return null;
  return { from, to };
};

/**
 * Where each suggestion's quote is in the document: the first textblock
 * (paragraph or heading) that contains it, or null when it's gone (stale).
 */
export const suggestionRanges = (doc: PMNode, items: SuggestionItem[]): Map<number, SuggestionRange | null> => {
  const ranges = new Map<number, SuggestionRange | null>();
  for (const item of items) {
    let found: SuggestionRange | null = null;
    doc.descendants((node, pos) => {
      if (found) return false;
      if (!node.isTextblock) return true;
      found = rangeInBlock(node, pos, item.quote);
      return false;
    });
    ranges.set(item.id, found);
  }
  return ranges;
};

/**
 * Replaces the first match of `quote` with `text` as plain text (never parsed
 * as HTML), keeping the marks of the quote's first character.
 * Returns false when the quote is no longer in the document.
 */
export const replaceQuote = (editor: Editor, quote: string, text: string): boolean => {
  const range = suggestionRanges(editor.state.doc, [{ id: 0, quote }]).get(0);
  if (!range) return false;
  const plain = text.replace(/\s*\n\s*/g, " ");
  if (!plain) return editor.chain().focus().deleteRange(range).run();
  const marks = editor.state.doc.nodeAt(range.from)?.marks.map((mark) => mark.toJSON()) ?? [];
  return editor.chain().focus().insertContentAt(range, { type: "text", text: plain, marks }).run();
};

type PluginState = { items: SuggestionItem[]; activeId: number | null; decorations: DecorationSet };

const key = new PluginKey<PluginState>("suggestionHighlight");

const decorate = (doc: PMNode, items: SuggestionItem[], activeId: number | null): DecorationSet => {
  if (items.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  suggestionRanges(doc, items).forEach((range, id) => {
    if (!range) return;
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: id === activeId ? "cv-suggestion cv-suggestion-active" : "cv-suggestion",
        "data-suggestion-id": String(id),
      })
    );
  });
  return DecorationSet.create(doc, decorations);
};

/** Highlights review suggestions' quotes in the editor. */
export const SuggestionHighlight = Extension.create({
  name: "suggestionHighlight",

  addCommands() {
    return {
      setSuggestions:
        (items, activeId) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(key, { items, activeId }).setMeta("addToHistory", false);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<PluginState>({
        key,
        state: {
          init: () => ({ items: [], activeId: null, decorations: DecorationSet.empty }),
          apply: (tr, value) => {
            const meta = tr.getMeta(key) as { items: SuggestionItem[]; activeId: number | null } | undefined;
            if (meta) return { ...meta, decorations: decorate(tr.doc, meta.items, meta.activeId) };
            if (tr.docChanged && value.items.length > 0) {
              return { ...value, decorations: decorate(tr.doc, value.items, value.activeId) };
            }
            return value;
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
        },
      }),
    ];
  },
});
