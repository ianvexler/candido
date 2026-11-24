// Page breaks for the CV on its real page. Pure arithmetic over measured blocks;
// the page itself decides what to measure and how to draw the breaks.

export type Block = { key: string | null; top: number; bottom: number; keepWithNext: boolean };
export type Paging = { pages: number; used: number };
export type PageBreak = { key: string; top: number; page: number };
export type PageMetrics = { pageHeight: number; sheetHeight: number; marginTop: number; gap: number };

// Layout rounds to fractions of a pixel, so a block that overshoots by less than this still fits.
const TOLERANCE = 0.5;

export function paginate(blocks: Block[], pageHeight: number): Paging & { breaks: PageBreak[] } {
  const breaks: PageBreak[] = [];
  let page = 0;
  let pageStart = 0;
  let first = 0; // index of the block that starts the current page

  // Starts the next page at `at`, which may be earlier than the block being placed.
  const startPageAt = (at: number) => {
    page++;
    pageStart = blocks[at].top;
    first = at;
    if (blocks[at].key !== null) breaks.push({ key: blocks[at].key as string, top: blocks[at].top, page });
  };

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const tall = block.bottom - block.top > pageHeight + TOLERANCE;
    const fits = block.bottom - pageStart <= pageHeight + TOLERANCE;

    if (i > first && (tall || !fits)) {
      // Heads directly before the block go with it, unless they start the page already.
      let at = i;
      while (at - 1 >= first && blocks[at - 1].keepWithNext) at--;
      if (at === first) at = i;
      if (blocks[at].key === null) {
        // Nothing to hang a rule on: start the page at the nearest keyed block above, if any.
        let earlier = at - 1;
        while (earlier > first && blocks[earlier].key === null) earlier--;
        if (earlier > first) at = earlier;
      }
      startPageAt(at);
      i = at; // place everything from there again on the new page
      continue;
    }

    if (tall) {
      // Spans pages; what follows continues on its last page.
      const extra = Math.ceil((block.bottom - block.top - TOLERANCE) / pageHeight) - 1;
      page += extra;
      pageStart = block.top + extra * pageHeight;
    }
    i++;
  }

  const last = blocks[blocks.length - 1];
  return { breaks, pages: page + 1, used: last ? last.bottom - pageStart : 0 };
}

export function combineColumns(columns: Paging[]): Paging {
  const pages = Math.max(1, ...columns.map((c) => c.pages));
  const used = Math.max(0, ...columns.filter((c) => c.pages === pages).map((c) => c.used));
  return { pages, used };
}

// Padding that puts a block's text at the top of its page on the sheet stack, given where it
// sits without breaks and the padding already added above it.
export function spaceBefore(breakTop: number, breakPage: number, earlier: number, metrics: PageMetrics): number {
  return breakPage * (metrics.sheetHeight + metrics.gap) - breakTop - earlier;
}

const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export function fitMessage(paging: Paging, metrics: PageMetrics, lineHeight: number, exact: boolean): string {
  const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;
  if (paging.pages <= 1) {
    const spare = Math.max(0, Math.floor((metrics.pageHeight - paging.used) / lineHeight));
    const lead = exact ? "Fits one page" : "About one page";
    if (spare === 0) return exact ? `${lead} exactly` : lead;
    return `${lead}, ${lines(spare)} spare`;
  }
  const count = `${exact ? "" : "About "}${paging.pages} pages`;
  if (paging.used >= metrics.pageHeight / 2) return count;
  const target = paging.pages - 1;
  return `${count}. Cut about ${lines(Math.ceil(paging.used / lineHeight))} to fit ${WORDS[target - 1] ?? target}.`;
}
