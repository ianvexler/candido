import { parseHtml, textOf } from "@/lib/resume/items";
import type { Editor } from "@tiptap/core";
import { closeHistory, undoNoScroll } from "@tiptap/pm/history";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { HIDDEN_MARK } from "./HiddenMark";
import { whenLeft } from "./whenLeft";

const LISTS = ["bulletList", "orderedList"];

const isBlank = (node: PMNode) => !node.textContent.trim();

const lastList = (doc: PMNode) => {
  let found: { node: PMNode; pos: number } | null = null;
  doc.forEach((node, pos) => {
    if (LISTS.includes(node.type.name)) found = { node, pos };
  });
  return found as { node: PMNode; pos: number } | null;
};

/** Watches an empty bullet until the editor is left: it goes then, if still empty. */
const dropIfLeftEmpty = (editor: Editor, caret: number, onLost: () => void) => {
  // In its text: the bullet itself may be indented.
  let pos = caret;
  let touched = false;
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    touched = true;
    pos = transaction.mapping.map(pos);
  };
  const bullet = () => {
    const $pos = editor.state.doc.resolve(pos);
    const depth = $pos.depth - 1;
    const isItem = depth > 1 && $pos.node(depth).type.name === "listItem";
    return isItem && isBlank($pos.node(depth)) ? { node: $pos.node(depth), start: $pos.before(depth) } : null;
  };
  const drop = () => {
    const { state, view } = editor;
    const found = bullet();
    if (!found) return;
    // As if it had never been added.
    if (!touched) return void undoNoScroll(state, view.dispatch);
    const { tr, schema } = state;
    const { node, start } = found;
    const list = state.doc.resolve(start);
    if (list.parent.childCount > 1) tr.delete(start, start + node.nodeSize);
    else if (list.depth > 1 || state.doc.childCount > 1) tr.delete(list.before(), list.after());
    else tr.replaceWith(0, state.doc.content.size, schema.nodes.paragraph.create());
    // One undo step with what emptied it.
    view.dispatch(tr.setMeta("appendedTransaction", state.tr));
  };

  const stop = () => {
    stopWatching();
    editor.off("transaction", onTransaction);
    editor.off("destroy", onDestroy);
  };
  const stopWatching = whenLeft(
    (element) => editor.view.dom.contains(element),
    () => {
      stop();
      drop();
    }
  );
  // Its text loads anew elsewhere, with the bullet.
  const onDestroy = () => {
    stop();
    if (bullet()) setTimeout(onLost);
  };
  editor.on("transaction", onTransaction);
  editor.on("destroy", onDestroy);
};

/**
 * Puts the caret in an empty bullet at the end of the last list, or of a new one.
 * One left empty goes, or if the editor goes first is reported: see withoutBlankEnd.
 */
export const addBullet = (editor: Editor, onLost: () => void) => {
  const { view, state } = editor;
  const { doc, schema } = state;
  const list = lastList(doc);
  const last = list?.node.lastChild;
  if (list && last && isBlank(last)) {
    const end = list.pos + list.node.nodeSize - 2;
    view.dispatch(state.tr.setSelection(Selection.near(doc.resolve(end), -1)));
    view.focus();
    return;
  }

  const item = schema.nodes.listItem.create(null, schema.nodes.paragraph.create());
  // A step of its own for undo, before and after.
  const tr = closeHistory(state.tr);
  let at: number;
  if (list) {
    at = list.pos + list.node.nodeSize - 1;
    tr.insert(at, item);
  } else {
    const newList = schema.nodes.bulletList.create(null, item);
    const empty = doc.childCount === 1 && doc.firstChild?.type.name === "paragraph" && doc.firstChild.content.size === 0;
    at = empty ? 1 : doc.content.size + 1;
    if (empty) tr.replaceWith(0, doc.content.size, newList);
    else tr.insert(doc.content.size, newList);
  }
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 2)));
  view.dispatch(closeHistory(view.state.tr));
  view.focus();
  dropIfLeftEmpty(editor, at + 2, onLost);
};

/** Content without a blank bullet at the end of its last list. */
export const withoutBlankEnd = (html: string): string => {
  const content = parseHtml(html);
  const list = content.querySelector(":scope > :is(ul, ol):not(:has(~ ul, ~ ol))");
  const last = list?.lastElementChild;
  if (!list || !last || textOf(last)) return html;
  last.remove();
  if (list.children.length === 0) list.remove();
  return content.innerHTML;
};

/** After the last text of an item that shows, or null without the item. */
export const caretAtItem = (doc: PMNode, itemId: string): number | null => {
  let caret: number | null = null;
  doc.descendants((node, pos) => {
    if (caret !== null) return false;
    if (node.attrs.cvItem !== itemId) return true;
    caret = Selection.near(doc.resolve(pos + node.nodeSize - 1), -1).head;
    node.descendants((inner, offset) => {
      const at = pos + 1 + offset;
      if (inner.isInline && !inner.marks.some(({ type }) => type.name === HIDDEN_MARK)) caret = at + inner.nodeSize;
      return true;
    });
    return false;
  });
  return caret;
};
