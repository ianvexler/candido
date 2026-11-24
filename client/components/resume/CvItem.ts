import { Extension } from "@tiptap/core";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { ITEM_ATTRIBUTE } from "@/lib/resume/items";
import { newEntryId } from "@/lib/resume/sectionEntries";

const ATTRIBUTE = "cvItem";
const ITEM_TYPES = ["paragraph", "heading", "blockquote", "listItem"];
const LIST_TYPES = ["bulletList", "orderedList"];
// What the server accepts.
const VALID_ID = /^[\w-]{1,64}$/;
// Long enough for the editor to read the composed text.
const COMPOSITION_END_MS = 60;

type DocItem = { node: PMNode; pos: number; id: string | null; blank: boolean };

const idOf = (node: PMNode): string | null => node.attrs[ATTRIBUTE] ?? null;

/** As lib/resume/items, but blank ones too: an emptied item keeps its id. */
const itemsIn = (doc: PMNode): DocItem[] => {
  const items: DocItem[] = [];
  const add = (node: PMNode, pos: number) =>
    items.push({ node, pos, id: idOf(node), blank: !/\P{White_Space}/u.test(node.textContent) });

  doc.forEach((node, pos) => {
    if (LIST_TYPES.includes(node.type.name)) node.forEach((child, offset) => add(child, pos + 1 + offset));
    else if (ITEM_TYPES.includes(node.type.name)) add(node, pos);
  });
  return items;
};

/** Where the item's first line of text is now, or null if that was deleted. */
const textNow = (item: DocItem, mapping: Mapping): number | null => {
  let start = item.pos + 1;
  let end = start;
  let found = item.node.isTextblock;
  if (found) end = start + item.node.content.size;
  item.node.descendants((node, offset) => {
    if (found || !node.isTextblock) return !found;
    found = true;
    start = item.pos + 2 + offset;
    end = start + node.content.size;
    return false;
  });

  const first = mapping.mapResult(start, 1);
  if (!first.deleted) return first.pos;
  const last = mapping.mapResult(end, -1);
  return last.deleted ? null : last.pos;
};

/** Gives each item with text its own id, and takes ids off everything else. */
const fixIds = (transactions: readonly Transaction[], before: EditorState, state: EditorState): Transaction | null => {
  const mapping = new Mapping();
  transactions.forEach((tr) => mapping.appendMapping(tr.mapping));

  const items = itemsIn(state.doc);
  const ids = items.map(({ id }) => id);
  const earlier = itemsIn(before.doc).filter(({ id }) => id !== null);
  const itemNow = (item: DocItem) => {
    const pos = textNow(item, mapping);
    return pos === null ? -1 : items.findIndex(({ node, pos: start }) => start < pos && pos < start + node.nodeSize);
  };

  // An id used twice stays with the original, such as when a copy is dropped above it.
  new Set(ids.filter((id) => id !== null)).forEach((id) => {
    const holders = [...items.keys()].filter((index) => ids[index] === id);
    if (holders.length < 2) return;
    const withText = holders.filter((index) => !items[index].blank);
    const candidates = withText.length > 0 ? withText : holders;
    const original = earlier.find((item) => item.id === id);
    const place = original ? itemNow(original) : -1;
    const owner = candidates.includes(place) ? place : candidates[0];
    holders.forEach((index) => {
      if (index !== owner) ids[index] = null;
    });
  });

  // Wrapped: the id is now on what's inside.
  items.forEach(({ node }, index) => {
    if (ids[index] !== null) return;
    node.descendants((inner) => {
      const id = idOf(inner);
      if (ids[index] === null && id !== null && !ids.includes(id)) ids[index] = id;
      return ids[index] === null;
    });
  });

  // Lifted or made another kind of block: the id is gone. Enter at the start of
  // an item: it stayed on the empty block before the text.
  earlier.forEach((item) => {
    const holder = ids.indexOf(item.id);
    if (holder >= 0 && (item.blank || !items[holder].blank)) return;
    const index = itemNow(item);
    if (index < 0 || ids[index] !== null) return;
    if (holder >= 0) ids[holder] = null;
    ids[index] = item.id;
  });

  const tr = state.tr;
  const itemAt = new Map(items.map(({ pos }, index) => [pos, index]));
  state.doc.descendants((node, pos) => {
    if (!ITEM_TYPES.includes(node.type.name)) return;
    const index = itemAt.get(pos);
    const id = index === undefined ? null : (ids[index] ?? (items[index].blank ? null : newEntryId()));
    if (id !== idOf(node)) tr.setNodeAttribute(pos, ATTRIBUTE, id);
  });
  return tr.docChanged ? tr.setStoredMarks(state.storedMarks) : null;
};

const withoutIds = (fragment: Fragment): Fragment => {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    const copy = node.copy(withoutIds(node.content));
    nodes.push(
      idOf(node) === null ? copy : node.type.create({ ...node.attrs, [ATTRIBUTE]: null }, copy.content, node.marks)
    );
  });
  return Fragment.fromArray(nodes);
};

/** Item ids: kept while items are edited or moved, new for new and copied ones. */
const CvItem = Extension.create({
  name: ATTRIBUTE,

  addGlobalAttributes() {
    return [
      {
        types: ITEM_TYPES,
        attributes: {
          [ATTRIBUTE]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => {
              const id = element.getAttribute(ITEM_ATTRIBUTE);
              return id !== null && VALID_ID.test(id) ? id : null;
            },
            renderHTML: (attributes) => (attributes[ATTRIBUTE] ? { [ITEM_ATTRIBUTE]: attributes[ATTRIBUTE] } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const key = new PluginKey(ATTRIBUTE);
    let view: EditorView | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    return [
      new Plugin({
        key,
        view: (editorView) => {
          view = editorView;
          return { destroy: () => clearTimeout(timer) };
        },
        // A change of id redraws the block, which would break text being composed (IME).
        appendTransaction: (transactions, before, state) =>
          !view?.composing && transactions.some((tr) => tr.docChanged || tr.getMeta(key))
            ? fixIds(transactions, before, state)
            : null,
        props: {
          handleDOMEvents: {
            compositionend: (composed) => {
              clearTimeout(timer);
              timer = setTimeout(() => composed.dispatch(composed.state.tr.setMeta(key, true)), COMPOSITION_END_MS);
              return false;
            },
          },
          // Something dragged within this editor keeps its ids, in case it's a move.
          transformPasted: (slice, target) =>
            slice === target.dragging?.slice
              ? slice
              : new Slice(withoutIds(slice.content), slice.openStart, slice.openEnd),
        },
      }),
    ];
  },
});

export default CvItem;
