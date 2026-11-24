import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { HIDDEN_MARK } from "../HiddenMark";

// Long enough for the editor to read the text.
const INPUT_END_MS = 60;

/** A stretch of hidden text in one block. */
type Run = { from: number; to: number; content: Fragment };

export const isHidden = (node: PMNode) => node.marks.some((mark) => mark.type.name === HIDDEN_MARK);

const hiddenRuns = (doc: PMNode): Run[] => {
  const runs: Run[] = [];
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return;
    let last: Run | null = null;
    block.forEach((node, offset) => {
      const from = pos + 1 + offset;
      if (!isHidden(node)) {
        last = null;
      } else if (last) {
        last.to = from + node.nodeSize;
        last.content = last.content.addToEnd(node);
      } else {
        last = { from, to: from + node.nodeSize, content: Fragment.from(node) };
        runs.push(last);
      }
    });
    return false;
  });
  return runs;
};

const textOf = (content: Fragment) => content.textBetween(0, content.size, undefined, "\n");

const hasDeletion = ({ from, to }: Run, mapping: Mapping) => {
  for (let pos = from; pos < to; pos++) if (mapping.mapResult(pos, 1).deletedAfter) return true;
  return false;
};

/** The hidden text in a range, and the ranges it takes up. */
const hiddenIn = (doc: PMNode, from: number, to: number) => {
  const parts: { from: number; to: number; text: string }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isInline || !isHidden(node)) return;
    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);
    if (start < end) parts.push({ from: start, to: end, text: node.isText ? node.text!.slice(start - pos, end - pos) : "\n" });
  });
  return { parts, text: parts.map((part) => part.text).join("") };
};

/** A line break the browser put in place of deleted text, to keep the block open. */
const strayBreaks = (transactions: readonly Transaction[], state: EditorState, inBlocks: (pos: number) => boolean) => {
  const found = new Set<number>();
  transactions.forEach((tr, t) =>
    tr.steps.forEach((step, s) =>
      step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
        if (oldStart === oldEnd || newStart === newEnd) return;
        let had = false;
        tr.docs[s].nodesBetween(oldStart, oldEnd, (node) => {
          if (node.type.name === "hardBreak") had = true;
        });
        if (had) return;
        const rest = new Mapping(tr.mapping.maps.slice(s + 1));
        transactions.slice(t + 1).forEach((later) => rest.appendMapping(later.mapping));
        const from = rest.map(newStart, -1);
        state.doc.nodesBetween(from, rest.map(newEnd, 1), (node, pos) => {
          if (node.type.name === "hardBreak" && pos >= from && inBlocks(pos)) found.add(pos);
        });
      })
    )
  );
  return [...found].sort((a, b) => b - a);
};

/** Where a block can take text, at or near a position. */
const textPlace = (doc: PMNode, pos: number) => {
  const $pos = doc.resolve(pos);
  return $pos.parent.inlineContent ? pos : Selection.near($pos, -1).from;
};

const keepHidden = (transactions: readonly Transaction[], before: EditorState, state: EditorState): Transaction | null => {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  // Undo and redo are exact as they are, and set content is meant as it is.
  if (transactions.some((tr) => tr.getMeta("history$") || tr.getMeta("preventUpdate") !== undefined)) return null;

  const runs = hiddenRuns(before.doc);
  if (runs.length === 0) return null;

  const mapping = new Mapping();
  transactions.forEach((tr) => mapping.appendMapping(tr.mapping));
  const tr = state.tr;

  runs.forEach((run) => {
    if (!hasDeletion(run, mapping)) return;
    const from = mapping.map(run.from, -1);
    const to = mapping.map(run.to, 1);
    const kept = hiddenIn(state.doc, from, to);
    if (kept.text.includes(textOf(run.content))) return;
    // After new text that replaced what the caret was in or after, if the run was still to come.
    const place = kept.parts[0]?.from ?? (run.from >= before.selection.from ? to : from);
    kept.parts.reverse().forEach((part) => tr.delete(tr.mapping.map(part.from, 1), tr.mapping.map(part.to, -1)));
    // Past those already put back there.
    const at = textPlace(tr.doc, tr.mapping.map(place, 1));
    tr.insert(at, tr.doc.resolve(at).parent.inlineContent ? run.content : state.schema.nodes.paragraph.create(null, run.content));
  });

  const hasHidden = (pos: number) => {
    const { parent } = tr.doc.resolve(tr.mapping.map(pos, -1));
    let found = false;
    parent.forEach((node) => (found ||= isHidden(node)));
    return found;
  };
  strayBreaks(transactions, state, hasHidden).forEach((pos) => {
    const at = tr.mapping.map(pos, 1);
    tr.delete(at, at + 1);
  });
  if (!tr.docChanged) return null;

  // Before what was put back, so that deleting goes on from there.
  const caret = tr.mapping.map(state.selection.from, -1);
  if (state.selection instanceof TextSelection) tr.setSelection(TextSelection.near(tr.doc.resolve(caret)));
  return tr.setStoredMarks(state.storedMarks);
};

/** The other end of the hidden text beside the caret, if it is the first or last of its block. */
const edgePast = ({ selection }: EditorState, dir: -1 | 1): number | null => {
  if (!(selection instanceof TextSelection) || !selection.$cursor) return null;
  const { $cursor } = selection;
  const edge = dir < 0 ? $cursor.start() : $cursor.end();
  if ($cursor.pos === edge) return null;
  let onlyHidden = true;
  $cursor.doc.nodesBetween(Math.min(edge, $cursor.pos), Math.max(edge, $cursor.pos), (node) => {
    if (node.isInline && !isHidden(node)) onlyHidden = false;
  });
  return onlyHidden ? edge : null;
};

/**
 * Keeps hidden text, which the page doesn't show, from being deleted by accident:
 * the browser takes it along with the text beside it. Only deleting a selection
 * that has it, or setting the content, takes it.
 */
const HiddenGuard = Extension.create({
  name: "hiddenGuard",
  // Keys get here before joining blocks does.
  priority: 1000,

  addProseMirrorPlugins() {
    // An input method or correction may select what it replaces, which isn't the user's selection.
    let composing: { nothingSelected: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = (view: EditorView) => {
      clearTimeout(timer);
      composing ??= { nothingSelected: view.state.selection.empty };
    };
    const end = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (composing = null), INPUT_END_MS);
    };

    return [
      new Plugin({
        key: new PluginKey("hiddenGuard"),
        view: () => ({ destroy: () => clearTimeout(timer) }),
        appendTransaction: (transactions, before, state) =>
          (composing?.nothingSelected ?? before.selection.empty) ? keepHidden(transactions, before, state) : null,
        props: {
          handleDOMEvents: {
            compositionstart: (view) => {
              start(view);
              return false;
            },
            compositionend: () => {
              end();
              return false;
            },
            beforeinput: (view, event) => {
              if (event.inputType === "insertReplacementText") {
                start(view);
                end();
              }
              return false;
            },
          },
          // Past hidden text at the edge, so that the block joins its neighbour as if it weren't there.
          handleKeyDown: (view, event) => {
            if (view.composing || (event.key !== "Backspace" && event.key !== "Delete")) return false;
            const edge = edgePast(view.state, event.key === "Backspace" ? -1 : 1);
            if (edge !== null) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, edge)));
            return false;
          },
        },
      }),
    ];
  },
});

export default HiddenGuard;
