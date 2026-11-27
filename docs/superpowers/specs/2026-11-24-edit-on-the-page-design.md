# Editing a CV on its real page

Status: approved 2026-11-24. Builds on the CV checklist (#20).
Prototype (throwaway, sample data): `.superpowers/mockups/edit-on-the-page.html`.

## Intent

Choosing what goes in a CV depends on how it looks and whether it fits. Today
the editor shows neither; the user finds out on a separate export screen. The
CV page should be the CV: the styled, paged result, edited in place, so an
application takes one screen and no back and forth.

## Goals

- What is edited looks exactly like what is exported, in both templates.
- The page count and space left are always visible and right.
- Including and leaving out stays one click, next to the text concerned.
- Design is changed on the same screen.

## Non-goals

AI pre-ticking, purpose labels, the new library page, new templates, columns or
fonts, drag and drop of text on the page, editing a full page on a phone.

## Anti-goals

- Tools that change the layout. Nothing but the CV takes part in its flow.
- A second renderer for editing that can drift from the exported one.
- Losing what the checklist work guarantees: left-out text is never in the
  page or editor, typing is never lost, saves don't overlap.

## What was tested

With the real templates in Chrome, before this was written:

| Question | Result |
|---|---|
| Does editable text move? | Classic: 0 of 92 blocks. Sidebar: up to 66 of 140 with TipTap's own `white-space: break-spaces`, 0 of 140 with `pre-wrap` |
| Is the page count right? | 12 of 12 mixes of template, margins and length (1 to 8 pages), against the real PDF |
| Are breaks in the right place? | Every page start compared matched the PDF |

Not tested: Letter paper, other fonts and sizes, Firefox and Safari printing,
real editors at full size.

## Approaches

1. **Edit the real page (chosen by the user, from the prototype).** One
   renderer, tools in the margins. Cost: editors inside templates, and paging
   on screen.
2. Keep the cards and add a live preview beside them. Cheaper, but everything
   is read twice and the CV is squeezed.
3. Preview only; clicking text opens a form beside it. Safe layout, but typing
   happens away from where it shows.

Points below that the prototype didn't show are proposals, marked †.

## Screen

```
Backend roles   [▮▮▮▮▯] Fits one page, 9 lines spare     Design  Export PDF
┌ outline ───┐           ┌──────────────────────┐
│ Experience │           │  the page            │  Add bullet
│  Northwind │  2 left   │                      │  Leave all out
│     4 of 6 │  out ┄┄┄┄┄│┄ • …                 │
└────────────┘           └──────────────────────┘
```

Plain neutral surface, white sheets, one amber accent for what is being worked
on. The app's own interface type; the CV's fonts only on the sheet.

### The page
- Sheets of the chosen paper with a gap between, at most 100%, scaled down to
  fit. † A control offers Fit and 100%.
- Name, headline, headings, titles, summaries and content are edited where they
  are. A quiet wash marks what can be edited on hover; the focused text gets an
  amber underline. Neither changes its size.
- Enter in a one-line field moves to the next field; † pasted text loses its
  line breaks there.
- Selecting text shows the formatting bar above it. Shortcuts and block
  formatting stay as they are.
- The role, dates and place line is one target. It opens a card under it with
  its fields; the page follows as they change. An unfinished month keeps the
  card open and says so, as now.
- † The contact line opens a card with the same fields and links as the header
  has now, including "Only on this CV" and "Use your profile".
- † Organisation equal to the title stays hidden in print; its card shows it.

### In the margins
- **Left: ticks.** Pointing at an entry, or having the caret in it, shows a bar
  at the sheet's edge and a tick beside each item, summary included. Clicking
  one leaves the item out. Headings inside an entry are items too.
- **Left: "2 left out".** A mark outside the sheet where left-out items would
  go, with a line to the spot. It opens a list to put them back. † Marks closer
  than their height merge into one, which lists by spot.
- **Right: entry tools.** Add bullet, Add summary, Add title, Add role and
  dates (only what is missing), Leave all out. † Delete entry, with its
  present confirmation.
- † **Right: change marks.** "Changed" and "Edited" beside the item, opening
  the same choices as now. "New" library items count in left-out marks, which
  then say "1 new".
- Tools outside the sheet need about 90px each side; with less, they open from
  one button at the entry's corner. †
- **See without tools** hides every mark.

### Outline
- Replaces the long checklist: sections and entries with their counts, what is
  left out struck through, "New" badges, search, drag and menu to reorder,
  remove, and choose the column.
- Clicking an entry scrolls to it and opens its full checklist beside the
  outline. The section name opens the section's.
- Includes content only the library has, as the checklist does.
- † Collapses to a button when the sheet wouldn't fit beside it.

### Fit
- One page: "Fits one page, 9 lines spare". More: "2 pages. Cut about 10 lines
  to fit one." Three or more say the page below. † At least half a page on the
  last page only says the count, as cutting is then unlikely to be wanted.
- Lines are of body text at its present size, rounded so the advice never
  promises too much.
- † In browsers where breaks aren't confirmed to match, it says "about".

### Design and export
- The present Design panel, saved designs and paper size move here, in a panel
  on the right. The CV's styles save as they do now.
- Export PDF waits for saves and prints the print page, which has only the CV
  and a "Print again" button. † A page count that differs from the one shown
  isn't corrected, only avoided by testing.

### Tailoring †
- The review's summary, requirements and gaps are in the right panel, sharing
  it with Design as tabs.
- Suggestions stay highlighted in the text. Their card opens beside the sheet
  at that line, or over it if there is no room.
- Suggestions for left-out text are in the left-out mark's list, with "put back
  to see it".

### Small screens
- Below 1024px, the present card editor and checklist stay as they are, with a
  **Page** tab showing the real page, not editable, scaled to the width. †
- The cards also remain the library's editor.

### Accessibility
- Reading order is the CV's. Each field has a label; tools follow their entry.
- Everything in the margins works by keyboard: Escape from text goes to the
  item's tick, then the entry's tools; Escape there goes back. Nothing needs
  hover. Touch on a large tablet shows tools for the entry with the caret. †
- The fit text is announced when the page count changes, not on each key.
- Reduced motion is respected. At 200% browser zoom all tools are reachable.

## How it fits together

- **One renderer.** The present templates take an optional editing context.
  With it, each piece of text renders the same element and class with an
  editable inside; without it, they render as today. The print page uses the
  latter.
- **Editors.** The entry's present TipTap editor goes inside `.rc-body`, using
  `pre-wrap` and the font's ligatures rather than TipTap's defaults. It still
  holds ticked content only. Text fields are plain text.
- **Same owner.** `useSectionDrafts`, the checklist, include and transfer
  requests and their guards stay. The page is another view of the drafts.
- **Tools** are in a layer over the sheets, placed from measurements, never
  inside the CV's elements.
- **Paging.** A pure function takes measured blocks (section head, list item,
  paragraph, heading, quote, header), the page's height and what must stay
  together, and returns break positions. It runs per column for Sidebar; the
  longest column gives the count. On screen a break becomes space before the
  block, as a decoration inside editors so it never enters saved content, and
  never on the print page. It runs after text, ticks, design, fonts or size
  change, at most once a frame. A block taller than a page is cut where the
  page ends.
- **Margins at a break** are dropped, as the printer does.
- Ticking keeps focus and scroll as the checklist does now.

## Constraints

- No server change. No new dependency.
- Existing CVs export exactly as before. The templates' printed markup doesn't
  change.
- Typing responds within 50ms with 40 sections and 400 items; paging may follow
  a frame later. Editors off screen may load when first needed. †
- Both templates, all fonts, A4 and Letter.

## Stages

Each is a separate plan, and the cards stay available until the last ships.

1. **The page:** templates with editing, fields and cards, paging, fit, design
   panel, export. Offered as a "Page" view beside the present one.
2. **The margins:** ticks, left-out marks, entry tools, outline, reordering.
   Becomes the default on wide screens.
3. **Tailoring and library:** suggestions beside the text, change marks, "New".
   The checklist and cards then remain only below 1024px and in the library.

## Testing

- **Parity:** for a set of CVs (both templates, papers, all fonts, sizes,
  long and short), every block has the same place in editing as on the print
  page, and the count and page starts match the PDF. Run in Chrome on demand
  and before each release.
- **Paging function:** unit tests for kept-together blocks, margins at breaks,
  over-tall blocks, two columns, empty pages.
- **No leaks:** page decorations and tools never reach saved content, the
  print page or the clipboard.
- **Editing:** existing tests stay; plus ticking while typing, undo, paste, IME,
  and focus after leaving out, by mouse, keyboard and touch.
- **By hand:** Firefox and Safari: editing, and printed count against shown.

## Risks

| Risk | Answer |
|---|---|
| Other browsers print other breaks | Check in stage 1; say "about" where unconfirmed |
| Space added for breaks makes the caret or selection jump | Decorations only between blocks; test typing across a break |
| Many editors slow typing | Load editors near the screen; measure with 400 items |
| Margin tools feel busy | Only the entry in hand shows tools; left-out marks stay quiet |

Stage 1 begins with a short proof in the app, with real editors: parity, typing
across a page break, and a printed count in Firefox and Safari. If one fails
with no fix, approach 2 is the fallback and the rest is reconsidered with the
user.

## Left to the builder

Component names, how text fields are made editable, when editors load, the
measuring technique, exact spacing and motion, and wording of small labels.
