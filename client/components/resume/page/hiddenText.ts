import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { HIDDEN_MARK } from "../HiddenMark";

/** Shows the hidden text of these items of an editor, as one step to undo. */
export const showHiddenInEditor = (editor: Editor, ids: string[]) => {
  const { state, view } = editor;
  const { tr } = state;
  const show = (item: PMNode, pos: number) => {
    if (ids.includes(item.attrs.cvItem ?? "")) tr.removeMark(pos, pos + item.nodeSize, state.schema.marks[HIDDEN_MARK]);
  };
  state.doc.forEach((block, pos) => {
    if (["bulletList", "orderedList"].includes(block.type.name)) block.forEach((item, offset) => show(item, pos + 1 + offset));
    else show(block, pos);
  });
  if (tr.docChanged) view.dispatch(tr);
  view.focus();
};
