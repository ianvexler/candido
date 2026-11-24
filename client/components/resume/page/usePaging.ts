"use client";

import type { DesignSettings } from "@/lib/resume/design";
import { combineColumns, PageMetrics, paginate, Paging } from "@/lib/resume/paging";
import type { PaperSize } from "@/lib/types";
import { RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { breakRules, isPadded } from "./breakRules";
import { MeasuredColumn, measureColumns, printTop } from "./measureBlocks";
import { lineHeight, pageMetrics } from "./pageSize";
import { scrollParent, viewOf } from "./scrolling";

export type PagePaging = {
  paging: Paging;
  metrics: PageMetrics;
  lineHeight: number;
  /** Whether this browser's print is known to break where this does. */
  exact: boolean;
  /** False until it was measured with its fonts. */
  ready: boolean;
};

interface PagingOptions {
  /** The data-cv-page of what holds the sections. */
  pageId: string;
  design: DesignSettings;
  paper: PaperSize;
  scale: number;
  /** The page is laid out with its breaks. Gets the same scale. */
  onLaidOut?: (root: HTMLElement, scale: number) => void;
}

type Result = { paging: Paging; ready: boolean };

// What the proof confirmed.
const isExact = () => / Chrome\/\d/.test(navigator.userAgent) && !/Mobile/.test(navigator.userAgent);

const ROUNDING = 0.01;

/** The line being written in. */
const caretBox = (root: HTMLElement): DOMRect | null => {
  const selection = getSelection();
  if (!selection?.focusNode || !root.contains(document.activeElement) || !root.contains(selection.focusNode)) return null;
  const { focusNode, focusOffset } = selection;
  const range = document.createRange();
  range.setStart(focusNode, focusOffset);
  const box = range.getClientRects()[0];
  if (box) return box;
  // Beside no text, as in an empty block.
  const beside = focusNode.childNodes[Math.min(focusOffset, focusNode.childNodes.length - 1)] ?? focusNode;
  const element = beside instanceof Element ? beside : beside.parentElement;
  return element?.getBoundingClientRect() ?? null;
};

const inView = (box: DOMRect | null, view: { top: number; bottom: number }) =>
  box !== null && box.bottom > view.top && box.top < view.bottom;

const pageColumn = ({ base, blocks }: MeasuredColumn, pageId: string, metrics: PageMetrics) => {
  // By place in the column, so that each break leads back to its block.
  const { breaks: found, pages, used } = paginate(
    blocks.map((block, index) => ({ ...block, key: block.key === null ? null : String(index) })),
    metrics.pageHeight
  );
  const breaks = found.flatMap((each) => {
    const block = blocks[Number(each.key)];
    return block.key === null ? [] : [{ ...each, key: block.key, block }];
  });
  return {
    paging: { pages, used },
    rules: (corrections?: number[]) => breakRules(breaks, pageId, metrics, corrections),
    /** What each break's space lacks, with the rules on: some margins only collapse without them. */
    missing: (scale: number): number[] => {
      let before = 0;
      return breaks.map(({ key, page, block }) => {
        const total = base + page * (metrics.sheetHeight + metrics.gap) - printTop(block, scale, isPadded(key));
        const own = total - before;
        before = total;
        return own;
      });
    },
  };
};

/**
 * Works out a CV's pages and starts each where its sheet does, by rules in a style
 * sheet of its own: nothing in the page changes for it. `rootRef` holds the
 * template, and doesn't scroll.
 */
export const usePaging = (rootRef: RefObject<HTMLElement | null>, { pageId, design, paper, scale, onLaidOut }: PagingOptions): PagePaging => {
  // By value: the owner may make an equal design on each render.
  const { template, margin_y } = design;
  const metrics = useMemo(() => pageMetrics({ template, margin_y }, paper), [template, margin_y, paper]);
  const designKey = JSON.stringify(design);
  const [result, setResult] = useState<Result>({ paging: { pages: 1, used: 0 }, ready: false });
  const latest = useRef({ metrics, scale, onLaidOut });
  const queueRef = useRef<() => void>(() => {});
  const fontsReady = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sheet = new CSSStyleSheet({ media: "screen" });
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const scroller = scrollParent(root) ?? document.scrollingElement ?? document.documentElement;
    let frame = 0;
    let shown: Result | null = null;
    let composingIn: Node | null = null;
    // Where each block was last, from the root's top.
    let placed: { key: string; top: number }[] = [];
    let placedScale = 0;

    const measure = () => {
      frame = 0;
      // Moving what is being composed could end it. Its end measures.
      if (composingIn?.isConnected) return;
      const { metrics: page, scale: at, onLaidOut: laidOut } = latest.current;

      const view = viewOf(scroller);
      const caret = caretBox(root);
      const rootTop = root.getBoundingClientRect().top;
      const held = placedScale === at ? placed.filter(({ top }) => rootTop + top * at >= view.top) : [];

      sheet.disabled = true;
      const columns = measureColumns(root, at);
      const paged = columns.map((column) => pageColumn(column, pageId, page));
      const apply = (rules: string[]) => sheet.replaceSync(rules.filter(Boolean).join("\n"));
      apply(paged.map(({ rules }) => rules()));
      sheet.disabled = false;
      const missing = paged.map((column) => column.missing(at));
      if (missing.flat().some((each) => Math.abs(each) > ROUNDING)) {
        apply(paged.map(({ rules }, index) => rules(missing[index])));
      }

      if (document.fonts.status === "loaded") fontsReady.current = true;
      const next: Result = { paging: combineColumns(paged.map(({ paging }) => paging)), ready: fontsReady.current };
      const same =
        shown !== null &&
        shown.ready === next.ready &&
        shown.paging.pages === next.paging.pages &&
        shown.paging.used === next.paging.used;
      // Before painting, so that a page never shows without its sheet.
      if (!same) flushSync(() => setResult(next));
      shown = next;

      const newRootTop = root.getBoundingClientRect().top;
      placed = columns.flatMap(({ blocks }) =>
        blocks.flatMap(({ key, start }) =>
          key === null ? [] : [{ key, top: (start.getBoundingClientRect().top - newRootTop) / at }]
        )
      );
      placedScale = at;

      let moved = 0;
      if (caret && inView(caret, view)) {
        moved = (caretBox(root)?.top ?? caret.top) - caret.top;
      } else if (scroller.scrollTop > 0) {
        const tops = new Map(placed.map(({ key, top }) => [key, top]));
        const first = held.find(({ key }) => tops.has(key));
        if (first) moved = (tops.get(first.key)! - first.top) * at;
      }
      if (Math.abs(moved) > ROUNDING) scroller.scrollTop += moved;
      laidOut?.(root, at);
    };

    const queue = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    queueRef.current = queue;

    // Not sizes, which its own rules change.
    const changes = new MutationObserver(queue);
    changes.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-empty"],
    });
    const ended = new AbortController();
    const { signal } = ended;
    root.addEventListener("compositionstart", (event) => (composingIn = event.target as Node), { signal });
    ["compositionend", "focusout"].forEach((name) =>
      root.addEventListener(
        name,
        () => {
          if (!composingIn) return;
          composingIn = null;
          queue();
        },
        { signal }
      )
    );
    document.fonts.addEventListener("loadingdone", queue, { signal });
    void document.fonts.ready.then(() => !signal.aborted && queue());
    queue();

    return () => {
      ended.abort();
      changes.disconnect();
      cancelAnimationFrame(frame);
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== sheet);
      queueRef.current = () => {};
    };
  }, [rootRef, pageId]);

  useLayoutEffect(() => {
    fontsReady.current = false;
  }, [design.font]);

  useLayoutEffect(() => {
    latest.current = { metrics, scale, onLaidOut };
  }, [metrics, scale, onLaidOut]);

  // The template's attributes aren't all watched.
  useLayoutEffect(() => queueRef.current(), [designKey, metrics, scale, onLaidOut]);

  const [exact] = useState(isExact);
  const line = lineHeight(design);
  return useMemo(() => ({ ...result, metrics, lineHeight: line, exact }), [result, metrics, line, exact]);
};
