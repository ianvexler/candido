/**
 * How a section and its entries look where they are edited: as a CV's page
 * (its Cards view), or in the library, where entries are cards to pick from.
 * Only styling and wording differ; the editing itself is the same.
 */
export type SectionLook = {
  /** The section's box. */
  article: string;
  /** Around the heading, and the library's menu beside it. */
  headingRow: string;
  heading: string;
  headingPlaceholder: string;
  /** Around its entries. */
  entries: string;
  addEntry: string;
  entry: {
    /** Around one entry. */
    card: string;
    /** Every entry shows its title line, even before one is written. */
    alwaysTitled: boolean;
    title: string;
    titlePlaceholder: string;
    bodyPlaceholder: string;
    /** Where the formatting toolbar goes while the entry is being edited. */
    toolbar: string;
  };
};

export const CV_LOOK: SectionLook = {
  article:
    "bg-white px-10 pb-6 pt-9 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] sm:px-14",
  headingRow: "",
  heading:
    "block w-full max-w-[calc(100%-9rem)] py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground placeholder:normal-case placeholder:tracking-normal",
  headingPlaceholder: "Section heading, e.g. Experience",
  entries: "mt-1 space-y-11",
  addEntry:
    "-ml-3 mt-9 text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100",
  entry: {
    card: "",
    alwaysTitled: false,
    title: "text-xl",
    titlePlaceholder: "Title",
    bodyPlaceholder: "Write here. Start a line with - for bullets.",
    toolbar:
      "pointer-events-none absolute -bottom-9 left-0 opacity-0 transition-opacity group-focus-within/entry:pointer-events-auto group-focus-within/entry:opacity-100",
  },
};

export const LIBRARY_LOOK: SectionLook = {
  article: "pb-6",
  headingRow: "flex items-center gap-2",
  heading: "block min-w-0 flex-1 py-0.5 text-2xl font-semibold tracking-tight",
  headingPlaceholder: "Section heading",
  entries: "mt-5 space-y-3",
  addEntry:
    "mt-3 h-11 w-full justify-start rounded-lg border border-dashed border-border px-5 text-muted-foreground hover:border-foreground/25 hover:text-foreground",
  entry: {
    card: "rounded-lg border border-border bg-background px-5 pt-3.5 pb-4 transition-colors hover:border-foreground/15 focus-within:border-foreground/25",
    alwaysTitled: true,
    title: "text-base",
    titlePlaceholder: "Entry title",
    bodyPlaceholder: "Write, or type - for a bullet",
    // In the card, below the text, so it never covers the next entry.
    toolbar: "mt-3 hidden w-fit shadow-none group-focus-within/entry:flex",
  },
};

/** The same box as a library entry, for other cards in the library. */
export const LIBRARY_CARD = LIBRARY_LOOK.entry.card;
