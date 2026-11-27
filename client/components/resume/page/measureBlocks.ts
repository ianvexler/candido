import type { Block } from "@/lib/resume/paging";
import { blockKey } from "./breakRules";

/** `base` is where the column's first page's content starts in the viewport, at the page's own scale. */
export type MeasuredColumn = { base: number; blocks: MeasuredBlock[] };

export type MeasuredBlock = Block & {
  element: Element;
  /** What print puts at the top of a page that starts here, whose own top may be above it. */
  start: Element;
};

const LISTS = ["UL", "OL"];
const UNBROKEN = ["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI"];

/** The blocks of a list or quote, with which child each is at every level. */
const inside = (element: Element, path: number[] = []): [Element, number[]][] =>
  [...element.children].flatMap((child, index) => {
    const at = [...path, index + 1];
    const splits = LISTS.includes(child.tagName) || child.tagName === "BLOCKQUOTE";
    return splits ? inside(child, at) : [[child, at] as [Element, number[]]];
  });

/** The first of a block that shows: its first paragraph may be all hidden. */
const firstShown = (block: Element): Element =>
  [...block.children].find((child) => child.getBoundingClientRect().height > 0) ?? block;

/** The page's columns: the sidebar template's two, or the one of the others. */
export const columnsOf = (root: HTMLElement): HTMLElement[] => {
  const found = [...root.querySelectorAll<HTMLElement>(".rs-side, .rs-main")];
  return found.length > 0 ? found : [...root.querySelectorAll<HTMLElement>(".resume-classic")];
};

/** Each column's blocks, from its first page's content top. */
export const measureColumns = (root: HTMLElement, scale: number): MeasuredColumn[] =>
  columnsOf(root).map((column) => measureColumn(column, scale));

/** One column's blocks, from its first page's content top. */
export const measureColumn = (column: HTMLElement, scale: number): MeasuredColumn => {
  const base = column.getBoundingClientRect().top / scale + parseFloat(getComputedStyle(column).paddingTop || "0");
  const blocks: MeasuredBlock[] = [];
  const add = (element: Element, key: string | null, keepWithNext = false, start = element) => {
    const box = element.getBoundingClientRect();
    // Nothing of it is there: hidden, or the head of an entry that has only content.
    if (box.height === 0) return;
    blocks.push({ key, top: box.top / scale - base, bottom: box.bottom / scale - base, keepWithNext, element, start });
  };

  column.querySelectorAll('[data-block="header"], [data-block="head"], [data-block="heading"], .rc-body').forEach((part) => {
    if (part.matches('[data-block="header"]')) return add(part, null);
    const sectionId = part.closest("[data-section-id]")?.getAttribute("data-section-id") ?? null;
    const entryId = part.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? null;
    if (sectionId === null) return;
    if (part.matches('[data-block="heading"]')) return add(part, blockKey({ sectionId, entryId, itemId: null, margin: true }));
    if (part.matches('[data-block="head"]')) {
      return add(part, blockKey({ sectionId, entryId, itemId: null }), true, firstShown(part));
    }

    const content = part.querySelector(":scope .ProseMirror") ?? part.querySelector(':scope [role="textbox"]') ?? part;
    [...content.children].forEach((block) => {
      const itemKey = (item: Element, more = {}) => {
        const itemId = item.getAttribute("data-cv-item");
        return itemId ? blockKey({ sectionId, entryId, itemId, ...more }) : null;
      };
      if (LISTS.includes(block.tagName)) {
        [...block.children].forEach((item) => add(item, itemKey(item), false, firstShown(item)));
      } else if (block.tagName === "BLOCKQUOTE") {
        // Its line runs from its first block on, which a margin on the quote doesn't stretch.
        inside(block).forEach(([child, path], index) =>
          add(child, index === 0 ? itemKey(block, { margin: true }) : itemKey(block, { path }))
        );
      } else if (UNBROKEN.includes(block.tagName)) {
        add(block, itemKey(block));
      } else {
        const { bottom, height } = block.getBoundingClientRect();
        const last = blocks[blocks.length - 1];
        if (height > 0 && last) last.bottom = Math.max(last.bottom, bottom / scale - base);
      }
    });
  });
  return { base, blocks };
};

/** Where a block's print starts now, past the space its own break has put inside it. */
export const printTop = ({ element, start }: MeasuredBlock, scale: number, padded: boolean): number => {
  const top = start.getBoundingClientRect().top / scale;
  return padded && start === element ? top + parseFloat(getComputedStyle(element).paddingTop || "0") : top;
};
