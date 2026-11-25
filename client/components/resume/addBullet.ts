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

// Where the bullet is that each editor's is watched for, while it is empty.
const watched = new WeakMap<Editor, () => number | null>();

/**
 * Watches an empty bullet, new or there before, or a new paragraph, until the editor
 * is left: it goes then, if still empty.
 */
const dropIfLeftEmpty = (
  editor: Editor,
  caret: number,
  isNew: boolean,
  onLost: () => void,
  kind: "bullet" | "paragraph" = "bullet"
) => {
  // In its text: the bullet itself may be indented.
  let pos = caret;
  let touched = false;
  const startOf = () => block()?.start ?? null;
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged) return;
    touched = true;
    pos = transaction.mapping.map(pos);
  };
  const block = () => {
    const $pos = editor.state.doc.resolve(pos);
    if (kind === "paragraph") {
      const { parent } = $pos;
      return $pos.depth === 1 && parent.type.name === "paragraph" && isBlank(parent) ? { node: parent, start: $pos.before() } : null;
    }
    const depth = $pos.depth - 1;
    const isItem = depth > 1 && $pos.node(depth).type.name === "listItem";
    return isItem && isBlank($pos.node(depth)) ? { node: $pos.node(depth), start: $pos.before(depth) } : null;
  };
  const drop = () => {
    const { state, view } = editor;
    const found = block();
    if (!found) return;
    // As if it had never been added.
    if (isNew && !touched) return void undoNoScroll(state, view.dispatch);
    const { tr, schema } = state;
    const { node, start } = found;
    const list = state.doc.resolve(start);
    if (kind === "paragraph") {
      // The body's only block is the empty body.
      if (state.doc.childCount === 1) return;
      tr.delete(start, start + node.nodeSize);
      // A list it split is one again.
      const { nodeBefore, nodeAfter } = tr.doc.resolve(start);
      if (nodeBefore && nodeBefore.type === nodeAfter?.type && LISTS.includes(nodeBefore.type.name)) tr.join(start);
    } else if (list.parent.childCount > 1) tr.delete(start, start + node.nodeSize);
    else if (list.depth > 1 || state.doc.childCount > 1) tr.delete(list.before(), list.after());
    else tr.replaceWith(0, state.doc.content.size, schema.nodes.paragraph.create());
    // One undo step with what emptied it.
    view.dispatch(touched ? tr.setMeta("appendedTransaction", state.tr) : closeHistory(tr));
  };

  const stop = () => {
    stopWatching();
    if (watched.get(editor) === startOf) watched.delete(editor);
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
    if (block()) setTimeout(onLost);
  };
  watched.set(editor, startOf);
  editor.on("transaction", onTransaction);
  editor.on("destroy", onDestroy);
};

/**
 * Puts the caret in an empty bullet at the end of the last list, or of a new one.
 * One left empty goes, also one that was there, or if the editor goes first is
 * reported: see withoutBlankEnd.
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
    if (watched.get(editor)?.() !== end - last.nodeSize + 1) dropIfLeftEmpty(editor, view.state.selection.head, false, onLost);
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
  dropIfLeftEmpty(editor, at + 2, true, onLost);
};

const findItem = (doc: PMNode, itemId: string) => {
  let found: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.cvItem !== itemId) return true;
    found = { node, pos };
    return false;
  });
  return found as { node: PMNode; pos: number } | null;
};

/** Where a new paragraph after an item goes, splitting its list if the item is in one; and the split. */
const paragraphPlace = (doc: PMNode, item: { node: PMNode; pos: number }) => {
  const $item = doc.resolve(item.pos);
  if ($item.depth === 0) return { at: item.pos + item.node.nodeSize, split: false };
  // Paragraphs go between the body's blocks, after the bullet the item is in.
  const top = $item.node(1);
  const topEnd = $item.after(1);
  if (!LISTS.includes(top.type.name)) return { at: topEnd, split: false };
  const end = $item.depth > 1 ? $item.after(2) : item.pos + item.node.nodeSize;
  return end === topEnd - 1 ? { at: topEnd, split: false } : { at: end, split: true };
};

/**
 * Puts the caret in a new bullet or paragraph after an item, or at the top for null:
 * a bullet after one goes in its list, or else in a new list; a paragraph after one
 * splits its list. False, changing nothing, without the item. One left empty goes.
 */
export const insertBlock = (editor: Editor, after: string | null, kind: "bullet" | "paragraph", onLost: () => void) => {
  const { view, state } = editor;
  const { doc, schema } = state;
  const item = after === null ? null : findItem(doc, after);
  if (after !== null && !item) return false;
  const empty = doc.childCount === 1 && doc.firstChild?.type.name === "paragraph" && doc.firstChild.content.size === 0;
  if (empty && kind === "paragraph") {
    view.dispatch(state.tr.setSelection(TextSelection.create(doc, 1)));
    view.focus();
    return true;
  }

  const paragraph = () => schema.nodes.paragraph.create();
  const bullet = () => schema.nodes.listItem.create(null, paragraph());
  const newList = () => schema.nodes.bulletList.create(null, bullet());
  // A step of its own for undo, before and after.
  const tr = closeHistory(state.tr);
  let caret: number;
  if (!item) {
    if (empty) tr.replaceWith(0, doc.content.size, newList());
    else tr.insert(0, kind === "bullet" ? newList() : paragraph());
    caret = kind === "bullet" ? 3 : 1;
  } else if (kind === "bullet") {
    const at = item.pos + item.node.nodeSize;
    const inList = item.node.type.name === "listItem";
    tr.insert(at, inList ? bullet() : newList());
    caret = at + (inList ? 2 : 3);
  } else {
    const { at, split } = paragraphPlace(doc, item);
    // The first half of the list ends there, and the other half starts after it.
    if (split) tr.split(at);
    const between = split ? at + 1 : at;
    tr.insert(between, paragraph());
    caret = between + 1;
  }
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)));
  view.dispatch(closeHistory(view.state.tr));
  view.focus();
  dropIfLeftEmpty(editor, caret, true, onLost, kind);
  return true;
};

/** After the last text of an item that shows, or null without the item. */
export const caretAtItem = (doc: PMNode, itemId: string): number | null => {
  const item = findItem(doc, itemId);
  if (!item) return null;
  const { node, pos } = item;
  let caret = Selection.near(doc.resolve(pos + node.nodeSize - 1), -1).head;
  node.descendants((inner, offset) => {
    const at = pos + 1 + offset;
    if (inner.isInline && !inner.marks.some(({ type }) => type.name === HIDDEN_MARK)) caret = at + inner.nodeSize;
    return true;
  });
  return caret;
};
