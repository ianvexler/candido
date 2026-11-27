import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { isHidden } from "./HiddenGuard";

const LISTS = ["bulletList", "orderedList"];
// As stripHiddenHtml's. Others print even when empty.
const DROPPED = ["paragraph", "heading", "blockquote", "listItem"];

type BlocksState = {
  /** Blocks that had nothing to print when loaded. They take no room until edited. */
  skipped: DecorationSet;
  focused: boolean;
};

const hasPrintedText = (node: PMNode): boolean => {
  let found = false;
  node.descendants((inner) => {
    if (inner.isText && !isHidden(inner) && inner.text!.trim()) found = true;
    return !found;
  });
  return found;
};

const isPrinted = (node: PMNode): boolean => {
  if (LISTS.includes(node.type.name)) {
    let some = false;
    node.forEach((item) => (some ||= isPrinted(item)));
    return some;
  }
  return !DROPPED.includes(node.type.name) || hasPrintedText(node);
};

const notPrinted = (doc: PMNode): DecorationSet => {
  // Else there would be nowhere to write.
  if (!hasPrintedText(doc)) return DecorationSet.empty;
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isInline) return false;
    if (isPrinted(node)) return !node.isTextblock;
    found.push(Decoration.node(pos, pos + node.nodeSize, { class: "page-skipped" }));
    return false;
  });
  return DecorationSet.create(doc, found);
};

const stillSkipped = (tr: Transaction, skipped: DecorationSet): DecorationSet => {
  const set = tr.docChanged ? skipped.map(tr.mapping, tr.doc) : skipped;
  const { from, to } = tr.selection;
  const gone = set.find().filter((block) => {
    const node = tr.doc.nodeAt(block.from);
    const reached = tr.selectionSet && from > block.from && to < block.to;
    return reached || (tr.docChanged && (!node || isPrinted(node)));
  });
  return gone.length > 0 ? set.remove(gone) : set;
};

/** Printed text has its spaces collapsed, across hidden text too. */
const collapsedSpaces = (block: PMNode, pos: number, hasCaret: boolean): Decoration[] => {
  const found: Decoration[] = [];
  let afterSpace = true;
  // While it's being typed in, only those that hidden text makes double.
  let acrossHidden = false;
  block.forEach((node, offset) => {
    if (isHidden(node)) {
      acrossHidden = true;
      return;
    }
    if (!node.isText) {
      afterSpace = true;
      acrossHidden = false;
      return;
    }
    for (let i = 0; i < node.text!.length; i++) {
      const space = /[ \t\r\n]/.test(node.text![i]);
      if (space && afterSpace && (acrossHidden || !hasCaret)) {
        const from = pos + 1 + offset + i;
        found.push(Decoration.inline(from, from + 1, { class: "page-collapsed" }));
      }
      afterSpace = space;
      acrossHidden = false;
    }
  });
  return found;
};

const decorate = (state: EditorState, { skipped, focused }: BlocksState): DecorationSet => {
  const { $head } = state.selection;
  const caretAt = focused && $head.parent.isTextblock ? $head.before() : -1;
  const found: Decoration[] = [];
  state.doc.descendants((block, pos) => {
    if (!block.isTextblock) return;
    const classes = [];
    if (pos === caretAt) classes.push("page-caret");
    if (block.childCount > 0 && !hasPrintedText(block)) {
      let onlyHidden = true;
      block.forEach((node) => (onlyHidden &&= isHidden(node)));
      // Nothing of it shows, so it has no line of its own.
      if (onlyHidden) classes.push("page-held");
    }
    if (classes.length > 0) found.push(Decoration.node(pos, pos + block.nodeSize, { class: classes.join(" ") }));
    if (!block.type.spec.code) found.push(...collapsedSpaces(block, pos, pos === caretAt));
    return false;
  });
  return found.length > 0 ? skipped.add(state.doc, found) : skipped;
};

/** Lays out what the editor has as it prints, where that differs. Only for the eye: the content never changes. */
const PrintedBlocks = Extension.create({
  name: "printedBlocks",

  addProseMirrorPlugins() {
    const key = new PluginKey<BlocksState>("printedBlocks");
    return [
      new Plugin<BlocksState>({
        key,
        state: {
          init: (_, state) => ({ skipped: notPrinted(state.doc), focused: false }),
          apply: (tr, value) => ({
            skipped: stillSkipped(tr, value.skipped),
            focused: tr.getMeta("focus") ? true : tr.getMeta("blur") ? false : value.focused,
          }),
        },
        props: { decorations: (state) => decorate(state, key.getState(state)!) },
      }),
    ];
  },
});

export default PrintedBlocks;
