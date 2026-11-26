import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { addBullet, caretAtItem, type DropLost, insertBlock } from "./addBullet";
import type { EditTarget } from "./editChannel";
import { scrollParent, viewOf } from "./page/scrolling";

// What shows at the edge of the screen is too little to write in.
const MARGIN = 24;

/** Scrolls to it unless it is on the screen. */
export const bringIntoView = (element: Element | null) => {
  if (!element) return;
  const view = viewOf(scrollParent(element) ?? document.scrollingElement ?? document.documentElement);
  const { top, bottom } = element.getBoundingClientRect();
  if (top < view.top + MARGIN || bottom > view.bottom - MARGIN) element.scrollIntoView({ block: "center" });
};

/** Focuses a field or editable text, at its end or with all of it selected. */
export const focusText = (element: HTMLElement, selected = false) => {
  element.focus({ preventScroll: true });
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(selected ? 0 : element.value.length, element.value.length);
  } else {
    const selection = getSelection();
    selection?.selectAllChildren(element);
    if (!selected) selection?.collapseToEnd();
  }
  bringIntoView(element);
};

/** Puts the caret in an item, or a new bullet or paragraph. False if it isn't there. */
export const editInEditor = (editor: Editor, target: EditTarget, onLost: (drop: DropLost) => void): boolean => {
  const { view } = editor;
  if (target.what === "bullet") {
    addBullet(editor, onLost);
  } else if (target.what === "insert") {
    if (!insertBlock(editor, target.after, target.kind, onLost)) return false;
  } else {
    const at = target.what === "item" ? caretAtItem(view.state.doc, target.itemId) : null;
    if (at === null) return false;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
    view.focus();
  }
  const { node } = view.domAtPos(view.state.selection.head);
  bringIntoView(node instanceof Element ? node : node.parentElement);
  return true;
};
