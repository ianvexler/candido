import { Editor, Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findQuote } from "@/lib/resume/suggestions";
import { HIDDEN_MARK } from "../HiddenMark";

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

/** Marks that never carry over from the quote onto its replacement. */
const UNCOPIED_MARKS = new Set(["link", HIDDEN_MARK]);

type Run = { text: string; positions: number[] };

/**
 * The block's visible text as runs: hidden text (and any inline leaf other
 * than a hard break) ends a run, so a quote can never match hidden text or
 * join the text on either side of it. A hard break reads as a space, as it
 * does in the text the reviewer saw. `positions` holds each character's
 * document position.
 */
const visibleRuns = (block: PMNode, blockPos: number): Run[] => {
  const runs: Run[] = [{ text: "", positions: [] }];
  const boundary = () => {
    if (runs[runs.length - 1].text) runs.push({ text: "", positions: [] });
  };
  block.forEach((child, offset) => {
    const start = blockPos + 1 + offset;
    const run = runs[runs.length - 1];
    if (child.isText && !child.marks.some((mark) => mark.type.name === HIDDEN_MARK)) {
      run.text += child.text!;
      for (let i = 0; i < child.text!.length; i++) run.positions.push(start + i);
    } else if (child.type.name === "hardBreak") {
      run.text += " ";
      run.positions.push(start);
    } else {
      boundary();
    }
  });
  return runs;
};

/** Finds `quote` in one textblock's visible text and maps it to document positions, or null. */
const rangeInBlock = (block: PMNode, blockPos: number, quote: string): SuggestionRange | null => {
  for (const run of visibleRuns(block, blockPos)) {
    const match = findQuote(run.text, quote);
    if (match) return { from: run.positions[match.from], to: run.positions[match.to - 1] + 1 };
  }
  return null;
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
 * as HTML), keeping the marks of the quote's first character except a link
 * or the hidden mark.
 * Returns false when the quote is no longer in the document.
 */
export const replaceQuote = (editor: Editor, quote: string, text: string): boolean => {
  const range = suggestionRanges(editor.state.doc, [{ id: 0, quote }]).get(0);
  if (!range) return false;
  const plain = text.replace(/\s*\n\s*/g, " ");
  if (!plain) return editor.chain().focus().deleteRange(range).run();
  const marks = (editor.state.doc.nodeAt(range.from)?.marks ?? []).filter(
    (mark) => !UNCOPIED_MARKS.has(mark.type.name)
  );
  // A plain transaction: insertContentAt inserts text with the marks at the
  // position (a link included), ignoring the ones it is given.
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      tr.replaceWith(range.from, range.to, state.schema.text(plain, marks));
      return true;
    })
    .run();
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
