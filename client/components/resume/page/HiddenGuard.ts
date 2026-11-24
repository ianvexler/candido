import { Extension } from "@tiptap/core";
import { Fragment, type MarkType, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, Mapping, RemoveMarkStep, type Step, type StepMap } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { HIDDEN_MARK } from "../HiddenMark";

// Long enough for the editor to read the text.
const INPUT_END_MS = 60;

const LEAF = "\n";
// Not a character that text can have.
const TAKEN = "\0";
const FREE = /[^\0]+/g;

/** Hidden text of one block, or the part of it that was or wasn't selected. */
type Run = { from: number; to: number; content: Fragment };

export const isHidden = (node: PMNode) => node.marks.some((mark) => mark.type.name === HIDDEN_MARK);

export const hiddenBetween = (doc: PMNode, from: number, to: number) => {
  let found = false;
  doc.nodesBetween(from, to, (node) => {
    found ||= node.isInline && isHidden(node);
    return !found;
  });
  return found;
};

const withoutHiddenMark = (content: Fragment, mark: MarkType): Fragment => {
  const nodes: PMNode[] = [];
  content.forEach((node) => {
    const copy = node.isText ? node : node.copy(withoutHiddenMark(node.content, mark));
    nodes.push(copy.mark(mark.removeFromSet(node.marks)));
  });
  return Fragment.fromArray(nodes);
};

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

const textOf = (content: Fragment) => content.textBetween(0, content.size, undefined, LEAF);

/** Cut where the selection starts and ends. */
const cutAt = (run: Run, cuts: number[]): Run[] => {
  const ends = [run.from, ...cuts.filter((cut) => cut > run.from && cut < run.to).sort((a, b) => a - b), run.to];
  return ends.slice(1).map((to, i) => ({ from: ends[i], to, content: run.content.cut(ends[i] - run.from, to - run.from) }));
};

/** Hidden text of the new document, each character of which is only one old run's. */
const claimsOn = (doc: PMNode) => {
  const parts = hiddenRuns(doc).map(({ from, content }) => {
    const text = textOf(content);
    return { from, text, owners: Array<Run | null>(text.length).fill(null) };
  });
  type Part = (typeof parts)[number];
  /** What is nobody's in a range. The rest is blanked out. */
  const within = (from: number, to: number) =>
    parts.flatMap((part) => {
      const start = Math.max(from - part.from, 0);
      const text = part.text.replace(/[^]/g, (char, i: number) => (part.owners[i] ? TAKEN : char));
      const slice = text.slice(start, Math.max(to - part.from, start));
      return slice ? [{ part, start, text: slice }] : [];
    });
  const take = (part: Part, run: Run, start: number, length: number) => {
    part.owners.fill(run, start, start + length);
    return part.from + start;
  };

  return {
    /** What is still where it was. */
    own: (run: Run, pos: number) => {
      const part = parts.find(({ from, text }) => from <= pos && pos < from + text.length);
      if (part) take(part, run, pos - part.from, 1);
    },
    /** Where the text is in a range, if it is. */
    claim: (run: Run, wanted: string, from: number, to: number): number | null => {
      const found = within(from, to).find(({ text }) => text.includes(wanted));
      return found ? take(found.part, run, found.start + found.text.indexOf(wanted), wanted.length) : null;
    },
    /** Pieces of the text in a range. */
    pieces: (run: Run, whole: string, from: number, to: number): Place[] =>
      within(from, to).flatMap(({ part, start, text }) =>
        [...text.matchAll(FREE)]
          .filter(([piece]) => whole.includes(piece))
          .map(({ 0: piece, index }) => {
            const at = take(part, run, start + index, piece.length);
            return { from: at, to: at + piece.length };
          })
      ),
    /** What is nobody's. */
    rest: (from: number, to: number): Place[] =>
      within(from, to).flatMap(({ part, start, text }) =>
        [...text.matchAll(FREE)].map(({ 0: piece, index }) => {
          const at = part.from + start + index;
          return { from: at, to: at + piece.length };
        })
      ),
  };
};

type Place = { from: number; to: number };

/** The ranges of the new document that each step put in, and whether in place of something else. */
const insertions = (transactions: readonly Transaction[]) => {
  const found: (Place & { tr: Transaction; step: number; oldFrom: number; oldTo: number })[] = [];
  transactions.forEach((tr, t) =>
    tr.steps.forEach((change, step) =>
      change.getMap().forEach((oldFrom, oldTo, newFrom, newTo) => {
        if (newFrom === newTo) return;
        const rest = new Mapping(tr.mapping.maps.slice(step + 1));
        transactions.slice(t + 1).forEach((later) => rest.appendMapping(later.mapping));
        found.push({ from: rest.map(newFrom, -1), to: rest.map(newTo, 1), tr, step, oldFrom, oldTo });
      })
    )
  );
  return found;
};

/** A line break the browser put in place of deleted text, to keep the block open. */
const strayBreaks = (inserted: ReturnType<typeof insertions>, state: EditorState, inBlocks: (pos: number) => boolean) => {
  const found = new Set<number>();
  inserted.forEach(({ from, to, tr, step, oldFrom, oldTo }) => {
    if (oldFrom === oldTo) return;
    let had = false;
    tr.docs[step].nodesBetween(oldFrom, oldTo, (node) => {
      if (node.type.name === "hardBreak") had = true;
    });
    if (had) return;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === "hardBreak" && pos >= from && inBlocks(pos)) found.add(pos);
    });
  });
  return [...found].sort((a, b) => b - a);
};

/** Puts a run in a block that can have it, at or near a position. Code can't: it has no marks. */
const putBack = (tr: Transaction, pos: number, content: Fragment) => {
  const takes = (at: number) => {
    const { parent } = tr.doc.resolve(at);
    return parent.inlineContent && !parent.type.spec.code;
  };
  let at = pos;
  if (!takes(at)) at = Selection.near(tr.doc.resolve(pos), -1).from;
  if (takes(at)) return tr.insert(at, content);
  const paragraph = tr.doc.type.schema.nodes.paragraph.create(null, content);
  const $pos = tr.doc.resolve(pos);
  return tr.insert($pos.parent.inlineContent ? $pos.after() : pos, paragraph);
};

const isUnchanged = (map: StepMap) => {
  let unchanged = true;
  map.forEach(() => (unchanged = false));
  return unchanged;
};

/** Undo and redo are exact as they are, and set content is meant as it is. */
const isExact = (tr: Transaction) =>
  Boolean(tr.getMeta("history$")) || tr.getMeta("preventUpdate") !== undefined;

const isShow = (step: Step) => step instanceof RemoveMarkStep && step.mark.type.name === HIDDEN_MARK;

/** A link made from text as it was typed, with hidden text in its address. */
const linksHidden = (tr: Transaction) =>
  !tr.getMeta("preventAutolink") &&
  tr.steps.some((step, i) => {
    if (!(step instanceof AddMarkStep) || step.mark.type.name !== "link") return false;
    let found = false;
    tr.docs[i].nodesBetween(step.from, step.to, (node, pos) => {
      if (!node.isText || !isHidden(node)) return;
      const text = node.text!.slice(Math.max(step.from - pos, 0), step.to - pos);
      found ||= String(step.mark.attrs.href).includes(text);
    });
    return found;
  });

/** Takes the hidden mark away as part of something else, such as making text code, which has no marks. */
const reveals = (tr: Transaction) => !isExact(tr) && tr.steps.some(isShow) && !tr.steps.every(isShow);

const keepHidden = (
  transactions: readonly Transaction[],
  before: EditorState,
  state: EditorState,
  nothingSelected: boolean,
  pastedHidden: string[]
): Transaction | null => {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  if (transactions.some(isExact)) return null;

  const inserted = insertions(transactions);
  const mapping = new Mapping();
  transactions.forEach((tr) => mapping.appendMapping(tr.mapping));
  if (mapping.maps.every((map) => isUnchanged(map))) return null;

  const { ranges } = before.selection;
  const cuts = nothingSelected ? [] : ranges.flatMap(({ $from, $to }) => [$from.pos, $to.pos]);
  const isSelected = ({ from, to }: Run) =>
    !nothingSelected && ranges.some(({ $from, $to }) => from < $to.pos && to > $from.pos);
  const now = hiddenRuns(before.doc)
    .flatMap((run) => cutAt(run, cuts))
    .map((run) => {
      const left: number[] = [];
      for (let pos = run.from; pos < run.to; pos++) {
        const result = mapping.mapResult(pos, 1);
        // Not deletedAfter, which an insertion there sets too.
        if (!result.deleted) left.push(result.pos);
      }
      const whole = left.length === run.to - run.from && left.every((pos, i) => pos === left[0] + i);
      const at: number | null = whole ? left[0] : null;
      return { run, text: textOf(run.content), left, from: mapping.map(run.from, -1), to: mapping.map(run.to, 1), at };
    });
  const tr = state.tr;
  const claims = claimsOn(state.doc);
  now.forEach(({ run, left }) => left.forEach((pos) => claims.own(run, pos)));
  // Replaced as it was, or moved, as by joining blocks. The longest first: others may be part of it.
  now
    .filter(({ left }) => left.length === 0)
    .sort((a, b) => b.text.length - a.text.length)
    .forEach((each) => {
      each.at =
        claims.claim(each.run, each.text, each.from, each.to) ??
        claims.claim(each.run, each.text, 0, state.doc.content.size);
    });

  now
    .filter(({ run, at }) => at === null && !isSelected(run))
    .forEach(({ run, text, left, from, to }) => {
      const lost = left.length < run.to - run.from;
      const pieces = lost ? claims.pieces(run, text, from, to) : [];
      const old = [...left.map((pos) => ({ from: pos, to: pos + 1 })), ...pieces].sort((a, b) => a.from - b.from);
      // After new text that replaced what the caret was in or after, if the run was still to come.
      const place = old[0]?.from ?? (run.from >= before.selection.from ? to : from);
      const later = now.find((other) => other.run.from > run.from && other.at !== null && other.at >= from && other.at < to);
      old.reverse().forEach((piece) => tr.delete(tr.mapping.map(piece.from, 1), tr.mapping.map(piece.to, -1)));
      // Past those already put back there.
      putBack(tr, tr.mapping.map(Math.min(place, later?.at ?? place), 1), run.content);
    });

  // Only what was pasted or dropped hidden may be. The rest, such as what is typed, is to be seen.
  inserted
    .flatMap(({ from, to, tr: source }) => {
      const carried = ["paste", "drop"].includes(source.getMeta("uiEvent")) ? pastedHidden : [];
      return claims.rest(from, to).filter((place) => {
        const text = state.doc.textBetween(place.from, place.to, undefined, LEAF);
        return !carried.some((hidden) => hidden.includes(text));
      });
    })
    .forEach(({ from, to }) => {
      tr.removeMark(tr.mapping.map(from, 1), tr.mapping.map(to, -1), state.schema.marks[HIDDEN_MARK]);
    });

  const hasHidden = (pos: number) => {
    const { parent } = tr.doc.resolve(tr.mapping.map(pos, -1));
    let found = false;
    parent.forEach((node) => (found ||= isHidden(node)));
    return found;
  };
  if (nothingSelected) {
    strayBreaks(inserted, state, hasHidden).forEach((pos) => {
      const at = tr.mapping.map(pos, 1);
      tr.delete(at, at + 1);
    });
  }
  if (!tr.docChanged) return null;

  // Before what was put back, so that deleting goes on from there.
  const caret = tr.mapping.map(state.selection.from, -1);
  if (state.selection instanceof TextSelection && state.selection.empty) tr.setSelection(TextSelection.near(tr.doc.resolve(caret)));
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
 * that has it, or setting the content, takes it. Only the command shows it.
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

    // What the last pasted or dropped slice has hidden.
    let pastedHidden: string[] = [];

    return [
      new Plugin({
        key: new PluginKey("hiddenGuard"),
        view: () => ({ destroy: () => clearTimeout(timer) }),
        appendTransaction: (transactions, before, state) =>
          keepHidden(transactions, before, state, composing?.nothingSelected ?? before.selection.empty, pastedHidden),
        filterTransaction: (tr) => !reveals(tr) && !linksHidden(tr),
        props: {
          // Plain text comes with the marks of where it goes.
          transformPasted: (slice, view, plain) => {
            const { marks, topNodeType } = view.state.schema;
            const content = plain ? withoutHiddenMark(slice.content, marks[HIDDEN_MARK]) : slice.content;
            // Wrapped, as it may be bare text.
            const { paragraph } = view.state.schema.nodes;
            const blocks = content.firstChild?.isInline ? paragraph.create(null, content) : content;
            pastedHidden = hiddenRuns(topNodeType.create(null, blocks)).map((run) => textOf(run.content));
            return plain ? new Slice(content, slice.openStart, slice.openEnd) : slice;
          },
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
