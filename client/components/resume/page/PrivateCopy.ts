import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { isHidden } from "./HiddenGuard";

/** What was copied with its hidden text, for pasting on the page. */
export const SLICE_TYPE = "application/x-candido-slice";

const hasHidden = (content: Fragment): boolean => {
  let found = false;
  content.descendants((node) => {
    found ||= isHidden(node);
    return !found;
  });
  return found;
};

/** Without hidden text, and blocks that leaves empty. */
const withoutHidden = (content: Fragment): Fragment => {
  const nodes: PMNode[] = [];
  content.forEach((node) => {
    if (isHidden(node)) return;
    if (node.isLeaf || !hasHidden(node.content)) return nodes.push(node);
    const copy = node.copy(withoutHidden(node.content));
    if (copy.textContent.trim()) nodes.push(copy);
  });
  return Fragment.fromArray(nodes);
};

/** Opened no deeper than its first and last blocks still go. */
const shownSlice = ({ content, openStart, openEnd }: Slice): Slice => {
  const shown = withoutHidden(content);
  const { openStart: maxStart, openEnd: maxEnd } = Slice.maxOpen(shown);
  return new Slice(shown, Math.min(openStart, maxStart), Math.min(openEnd, maxEnd));
};

const copy = (view: EditorView, event: ClipboardEvent): boolean => {
  const { selection } = view.state;
  const data = event.clipboardData;
  if (!data || selection.empty) return false;
  const slice = selection.content();
  if (!hasHidden(slice.content)) return false;

  const shown = shownSlice(slice);
  event.preventDefault();
  data.clearData();
  data.setData(SLICE_TYPE, view.serializeForClipboard(slice).dom.innerHTML);
  // Not empty, or pasting would go by the text alone.
  data.setData("text/html", view.serializeForClipboard(shown).dom.innerHTML || "<span></span>");
  // Not the serializer's text, which is the whole selection's.
  data.setData(
    "text/plain",
    shown.content.textBetween(0, shown.content.size, "\n\n", (leaf) => (leaf.type.name === "hardBreak" ? "\n" : ""))
  );
  if (event.type === "cut" && view.editable) {
    view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
  }
  return true;
};

/** Hidden text goes from one of the page's editors to another, but not to other apps. */
const PrivateCopy = Extension.create({
  name: "privateCopy",
  // Before the editor's own copy and paste.
  priority: 1000,

  addProseMirrorPlugins() {
    let pasted = "";
    return [
      new Plugin({
        key: new PluginKey("privateCopy"),
        props: {
          handleDOMEvents: {
            copy,
            cut: copy,
            paste: (_, event) => {
              pasted = event.clipboardData?.getData(SLICE_TYPE) ?? "";
              // Only for this event's own paste.
              queueMicrotask(() => (pasted = ""));
              return false;
            },
          },
          transformPastedHTML: (html) => pasted || html,
        },
      }),
    ];
  },
});

export default PrivateCopy;
