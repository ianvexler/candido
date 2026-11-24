import { Extension } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Mapping, RemoveMarkStep, type Step } from "@tiptap/pm/transform";
import type { EditorView } from "@tiptap/pm/view";
import { HIDDEN_MARK } from "../HiddenMark";

// Long enough for the editor to read the text.
const INPUT_END_MS = 60;

// Not a character that text can have.
const TAKEN = "\0";
const FREE = /[^\0]+/g;

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

/** Hidden text of the new document, each character of which is only one old run's. */
const claimsOn = (doc: PMNode) => {
  const parts = hiddenRuns(doc).map(({ from, content }) => {
    const text = textOf(content);
    return { from, text, owners: Array<Run | null>(text.length).fill(null) };
  });
  /** What can be the run's in a range. The rest is blanked out. */
  const within = (run: Run, from: number, to: number) =>
    parts.flatMap((part) => {
      const start = Math.max(from - part.from, 0);
      const free = [...part.owners.keys()].map((i) => part.owners[i] === null || part.owners[i] === run);
      const text = part.text.replace(/[^]/g, (char, i: number) => (free[i] ? char : TAKEN));
      const slice = text.slice(start, Math.max(to - part.from, start));
      return slice ? [{ part, start, text: slice }] : [];
    });

  return {
    /** What is still where it was. */
    own: (run: Run, pos: number) => {
      const part = parts.find(({ from, text }) => from <= pos && pos < from + text.length);
      if (part) part.owners[pos - part.from] = run;
    },
    /** Where the whole run is in a range, if it is. */
    claim: (run: Run, wanted: string, from: number, to: number): number | null => {
      const found = within(run, from, to).find(({ text }) => text.includes(wanted));
      if (!found) return null;
      const start = found.start + found.text.indexOf(wanted);
      found.part.owners.fill(run, start, start + wanted.length);
      return found.part.from + start;
    },
    /** What there is of the run in a range. */
    pieces: (run: Run, whole: string, from: number, to: number) =>
      within(run, from, to).flatMap(({ part, start, text }) =>
        [...text.matchAll(FREE)]
          .filter(([piece]) => whole.includes(piece))
          .map(({ 0: piece, index }) => {
            part.owners.fill(run, start + index, start + index + piece.length);
            const at = part.from + start + index;
            return { from: at, to: at + piece.length };
          })
      ),
  };
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

/** Undo and redo are exact as they are, and set content is meant as it is. */
const isExact = (tr: Transaction) =>
  Boolean(tr.getMeta("history$")) || tr.getMeta("preventUpdate") !== undefined;

const isShow = (step: Step) => step instanceof RemoveMarkStep && step.mark.type.name === HIDDEN_MARK;

/** Takes the hidden mark away as part of something else, such as making text code, which has no marks. */
const reveals = (tr: Transaction) => !isExact(tr) && tr.steps.some(isShow) && !tr.steps.every(isShow);

const keepHidden = (
  transactions: readonly Transaction[],
  before: EditorState,
  state: EditorState,
  nothingSelected: boolean
): Transaction | null => {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  if (transactions.some(isExact)) return null;

  const runs = hiddenRuns(before.doc);
  if (runs.length === 0) return null;

  const mapping = new Mapping();
  transactions.forEach((tr) => mapping.appendMapping(tr.mapping));
  const tr = state.tr;

  const selected = ({ from, to }: Run) =>
    !nothingSelected && before.selection.ranges.some(({ $from, $to }) => from < $to.pos && to > $from.pos);
  const now = runs.map((run) => ({
    run,
    text: textOf(run.content),
    from: mapping.map(run.from, -1),
    to: mapping.map(run.to, 1),
    at: null as number | null,
  }));
  const deleted = now.filter(({ run }) => hasDeletion(run, mapping));
  if (deleted.length > 0) {
    const claims = claimsOn(state.doc);
    runs.forEach((run) => {
      for (let pos = run.from; pos < run.to; pos++) {
        const result = mapping.mapResult(pos, 1);
        if (!result.deletedAfter) claims.own(run, result.pos);
      }
    });
    // Replaced as it was, or moved, as by joining blocks. The longest first: others may be part of it.
    [...deleted]
      .sort((a, b) => b.text.length - a.text.length)
      .forEach((each) => {
        each.at = claims.claim(each.run, each.text, each.from, each.to) ?? claims.claim(each.run, each.text, 0, state.doc.content.size);
      });

    deleted
      .filter(({ run, at }) => at === null && !selected(run))
      .forEach(({ run, text, from, to }) => {
        const pieces = claims.pieces(run, text, from, to);
        // After new text that replaced what the caret was in or after, if the run was still to come.
        const place = pieces[0]?.from ?? (run.from >= before.selection.from ? to : from);
        const later = now.find((other) => other.run.from > run.from && other.at !== null && other.at >= from && other.at < to);
        pieces.reverse().forEach((piece) => tr.delete(tr.mapping.map(piece.from, 1), tr.mapping.map(piece.to, -1)));
        // Past those already put back there.
        const at = textPlace(tr.doc, tr.mapping.map(Math.min(place, later?.at ?? place), 1));
        tr.insert(at, tr.doc.resolve(at).parent.inlineContent ? run.content : state.schema.nodes.paragraph.create(null, run.content));
      });
  }

  const hasHidden = (pos: number) => {
    const { parent } = tr.doc.resolve(tr.mapping.map(pos, -1));
    let found = false;
    parent.forEach((node) => (found ||= isHidden(node)));
    return found;
  };
  if (nothingSelected) {
    strayBreaks(transactions, state, hasHidden).forEach((pos) => {
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

    return [
      new Plugin({
        key: new PluginKey("hiddenGuard"),
        view: () => ({ destroy: () => clearTimeout(timer) }),
        appendTransaction: (transactions, before, state) =>
          keepHidden(transactions, before, state, composing?.nothingSelected ?? before.selection.empty),
        filterTransaction: (tr) => !reveals(tr),
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
