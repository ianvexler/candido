import { PageBreak, PageMetrics, spaceBefore } from "@/lib/resume/paging";

/** What finds a block again: an item, or an entry's head, or the heading of a section without entries. */
export type BlockPlace = {
  sectionId: string;
  entryId: string | null;
  itemId: string | null;
  /** To a block inside the item: which child, from 1, at each level. */
  path?: number[];
  /** Has a border that padding would stretch. */
  margin?: boolean;
};

export const blockKey = (place: BlockPlace): string => JSON.stringify(place);

const placeOf = (key: string): BlockPlace => JSON.parse(key) as BlockPlace;

export const isPadded = (key: string) => !placeOf(key).margin;

// CSS.escape is for identifiers; these are strings.
const quoted = (value: string) =>
  `"${value.replace(/["\\]/g, "\\$&").replace(/\p{Cc}/gu, (char) => `\\${char.charCodeAt(0).toString(16)} `)}"`;

export const breakSelector = (key: string, pageId: string): string => {
  const { sectionId, entryId, itemId, path = [] } = placeOf(key);
  const section = `[data-cv-page=${quoted(pageId)}] [data-section-id=${quoted(sectionId)}]`;
  if (entryId === null) return `${section} > [data-block="heading"]`;
  const entry = `${section} [data-entry-id=${quoted(entryId)}]`;
  if (itemId === null) return `${entry} [data-block="head"]`;
  return `${entry} [data-cv-item=${quoted(itemId)}]${path.map((n) => ` > :nth-child(${n})`).join("")}`;
};

/**
 * The style sheet that starts a column's pages where its breaks are. Padding, as
 * margins would collapse. `corrections` add to each break's own space what
 * measuring found missing. `pageId` is the page's data-cv-page, as there may be several.
 */
export const breakRules = (breaks: PageBreak[], pageId: string, metrics: PageMetrics, corrections: number[] = []): string => {
  let added = 0;
  return breaks
    .map(({ key, top, page }, index) => {
      const space = spaceBefore(top, page, added, metrics);
      added += space;
      const property = isPadded(key) ? "padding-top" : "margin-top";
      const size = Number((space + (corrections[index] ?? 0)).toFixed(3));
      return `${breakSelector(key, pageId)}{${property}:${size}px!important}`;
    })
    .join("\n");
};
